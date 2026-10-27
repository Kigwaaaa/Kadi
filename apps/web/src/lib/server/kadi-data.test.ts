import { applyAction, createGame, type GameState } from "@kadi/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, publishRoomChanged } = vi.hoisted(() => ({
  from: vi.fn(),
  publishRoomChanged: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from }),
}));
vi.mock("./room-realtime", () => ({ publishRoomChanged }));

import {
  addChatMessage,
  addPlayer,
  cleanupIdleRooms,
  hashGuestToken,
  updateRoomState,
} from "./kadi-data";

const roomId = "e9c2aacf-b11d-4c84-99bf-58b8f5a6e341";
const playerId = "3aec80f2-3bc2-4c0c-8550-49d5db14c579";
const guestToken = "a".repeat(64);

function makeState(): GameState {
  return createGame(
    [playerId, "ff558d1c-17c5-462c-8e17-d3ec6b842165"],
    () => 0.5,
  );
}

function roomRecord(version: number, state: GameState) {
  return {
    id: roomId,
    code: "K4821",
    owner_player_id: playerId,
    status: "playing",
    state,
    version,
    window_deadline: null,
    created_at: "2026-10-27T10:00:00.000Z",
    updated_at: "2026-10-27T10:00:00.000Z",
  };
}

function queryBuilder(
  maybeSingleResult?: { data: unknown; error: null },
  singleResult?: { data: unknown; error: null },
) {
  const query = {
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    insert: vi.fn(() => query),
    lt: vi.fn(() => query),
    maybeSingle: vi.fn(async () => maybeSingleResult),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => singleResult),
    update: vi.fn(() => query),
  };
  return query;
}

describe("Supabase Kadi data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes guest tokens before persistence and never selects the hash", async () => {
    const player = {
      id: playerId,
      room_id: roomId,
      name: "Kadi",
      muted: false,
      joined_at: "2026-10-27T10:00:00.000Z",
      seat: 0,
    };
    const query = queryBuilder(undefined, { data: player, error: null });
    from.mockReturnValue(query);

    await expect(addPlayer(roomId, "Kadi", guestToken, 0)).resolves.toEqual(
      player,
    );
    expect(query.insert).toHaveBeenCalledWith({
      room_id: roomId,
      name: "Kadi",
      token_hash: hashGuestToken(guestToken),
      seat: 0,
    });
    expect(query.select).toHaveBeenCalledWith(
      "id,room_id,name,muted,joined_at,seat",
    );
    expect(hashGuestToken(guestToken)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("strips controls and trims chat text before inserting", async () => {
    const message = {
      id: "28b03a39-7c31-43a8-88c3-85e8799f23e8",
      room_id: roomId,
      player_id: playerId,
      body: "Hello table",
      created_at: "2026-10-27T10:00:00.000Z",
    };
    const query = queryBuilder(undefined, { data: message, error: null });
    from.mockReturnValue(query);

    await expect(
      addChatMessage(roomId, playerId, " \u0000Hello table\u0000 "),
    ).resolves.toEqual(message);
    expect(query.insert).toHaveBeenCalledWith({
      room_id: roomId,
      player_id: playerId,
      body: "Hello table",
    });
  });

  it("reapplies state updates on the latest version after a CAS conflict", async () => {
    const initial = makeState();
    const latest = { ...initial, logicalTimeMs: initial.logicalTimeMs + 1 };
    const next = { ...latest, logicalTimeMs: latest.logicalTimeMs + 10 };
    const builders = [
      queryBuilder({ data: roomRecord(0, initial), error: null }),
      queryBuilder({ data: null, error: null }),
      queryBuilder({ data: roomRecord(1, latest), error: null }),
      queryBuilder({ data: roomRecord(2, next), error: null }),
    ];
    from.mockImplementation(() => builders.shift());
    const updater = vi.fn((state: GameState) => ({
      ...state,
      logicalTimeMs: state.logicalTimeMs + 10,
    }));

    await expect(updateRoomState(roomId, 0, updater)).resolves.toMatchObject({
      version: 2,
      state: next,
    });
    expect(updater).toHaveBeenCalledTimes(2);
    expect(builders).toHaveLength(0);
  });

  it("revalidates an action if the room changed before its first CAS read", async () => {
    const initial = makeState();
    const latest = {
      ...initial,
      logicalTimeMs: initial.logicalTimeMs + 1,
    };
    const next = { ...latest, logicalTimeMs: latest.logicalTimeMs + 10 };
    from
      .mockReturnValueOnce(
        queryBuilder({ data: roomRecord(1, latest), error: null }),
      )
      .mockReturnValueOnce(
        queryBuilder({ data: roomRecord(2, next), error: null }),
      );
    const updater = vi.fn((state: GameState) => ({
      ...state,
      logicalTimeMs: state.logicalTimeMs + 10,
    }));

    await expect(updateRoomState(roomId, 0, updater)).resolves.toMatchObject({
      version: 2,
      state: next,
    });
    expect(updater).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("serializes simultaneous moves that start from the same room version", async () => {
    const initial = makeState();
    const firstCard = initial.players[0]!.hand[0]!;
    const playableCard = {
      ...firstCard,
      rank: 4 as const,
      suit: "clubs" as const,
    };
    initial.players[0]!.hand[0] = playableCard;
    initial.discard[initial.discard.length - 1] = {
      ...initial.discard[initial.discard.length - 1]!,
      rank: playableCard.rank,
      suit: playableCard.suit,
    };
    let storedRoom = roomRecord(0, initial);

    from.mockImplementation(() => {
      let updatePayload: Record<string, unknown> | null = null;
      let expectedVersion = -1;
      const query = {
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "version" && typeof value === "number") {
            expectedVersion = value;
          }
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (updatePayload === null) {
            return { data: structuredClone(storedRoom), error: null };
          }
          if (expectedVersion !== storedRoom.version) {
            return { data: null, error: null };
          }
          storedRoom = {
            ...storedRoom,
            ...updatePayload,
            version: storedRoom.version + 1,
          } as typeof storedRoom;
          return { data: structuredClone(storedRoom), error: null };
        }),
        select: vi.fn(() => query),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload;
          return query;
        }),
      };
      return query;
    });

    const move = () =>
      updateRoomState(roomId, 0, (state) => {
        const result = applyAction(
          state,
          playerId,
          { type: "play", cardIds: [playableCard.id] },
          { nowMs: state.logicalTimeMs + 1, rng: () => 0.5 },
        );
        if (!result.ok) throw new Error(result.error.code);
        return result.state;
      });
    const results = await Promise.allSettled([move(), move()]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(storedRoom.version).toBe(1);
    expect(storedRoom.state?.players[0]?.hand).toHaveLength(3);
    expect(storedRoom.state?.window?.actorId).toBe(playerId);
  });

  it("deletes rooms idle for 24 hours so their chat cascades with them", async () => {
    const deletedIds = [
      { id: roomId, version: 3 },
      { id: "fac853fe-9505-455f-9f32-39ac53f39a4e", version: 5 },
    ];
    const query = {
      delete: vi.fn(() => query),
      lt: vi.fn(() => query),
      or: vi.fn(() => query),
      select: vi.fn(async () => ({ data: deletedIds, error: null })),
    };
    from.mockReturnValue(query);

    await expect(
      cleanupIdleRooms(new Date("2026-10-27T12:00:00.000Z")),
    ).resolves.toEqual({
      deletedRoomIds: deletedIds.map(({ id }) => id),
    });
    expect(query.or).toHaveBeenCalledWith(
      "status.eq.finished,updated_at.lt.2026-10-26T12:00:00.000Z",
    );
    expect(query.select).toHaveBeenCalledWith("id,version");
    expect(publishRoomChanged).toHaveBeenNthCalledWith(1, roomId, 4);
    expect(publishRoomChanged).toHaveBeenNthCalledWith(
      2,
      "fac853fe-9505-455f-9f32-39ac53f39a4e",
      6,
    );
    expect(query.delete).toHaveBeenCalledOnce();
  });
});
