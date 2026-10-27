import { createGame } from "@kadi/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addChatMessage: vi.fn(),
  authContext: null as null | { room: unknown; player: unknown },
  clearChatMessages: vi.fn(),
  createGame: vi.fn(),
  deleteRoom: vi.fn(),
  enforceRateLimit: vi.fn(),
  getEarliestPlayer: vi.fn(),
  getRoom: vi.fn(),
  listChatMessagesSince: vi.fn(),
  listPlayers: vi.fn(),
  removePlayer: vi.fn(),
  setRoomOwner: vi.fn(),
  updatePlayer: vi.fn(),
  updateRoomState: vi.fn(),
  updateRoomStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/server/api-security", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("../../../../../lib/server/kadi-data", () => ({
  addChatMessage: mocks.addChatMessage,
  clearChatMessages: mocks.clearChatMessages,
  deleteRoom: mocks.deleteRoom,
  getEarliestPlayer: mocks.getEarliestPlayer,
  getRoom: mocks.getRoom,
  listChatMessagesSince: mocks.listChatMessagesSince,
  listPlayers: mocks.listPlayers,
  removePlayer: mocks.removePlayer,
  setRoomOwner: mocks.setRoomOwner,
  updatePlayer: mocks.updatePlayer,
  updateRoomState: mocks.updateRoomState,
  updateRoomStatus: mocks.updateRoomStatus,
}));
vi.mock("../../../../../lib/server/api-routes", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../../lib/server/api-routes")
    >();
  return {
    ...actual,
    requireRoomPlayer: vi.fn(async () => mocks.authContext),
  };
});

import { GET, POST } from "./route";

const roomId = "e9c2aacf-b11d-4c84-99bf-58b8f5a6e341";
const playerId = "3aec80f2-3bc2-4c0c-8550-49d5db14c579";
const otherPlayerId = "ff558d1c-17c5-462c-8e17-d3ec6b842165";

function makeRoom(ownerPlayerId = playerId) {
  return {
    id: roomId,
    code: "K4821",
    owner_player_id: ownerPlayerId,
    status: "playing",
    state: createGame([playerId, otherPlayerId], () => 0.5),
    version: 3,
    window_deadline: null,
    created_at: "2026-10-27T10:00:00.000Z",
    updated_at: "2026-10-27T10:00:00.000Z",
  };
}

describe("room API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const room = makeRoom();
    const player = {
      id: playerId,
      room_id: roomId,
      name: "Player one",
      muted: false,
      joined_at: "2026-10-27T10:00:00.000Z",
      seat: 0,
    };
    mocks.authContext = { room, player };
    mocks.getRoom.mockResolvedValue(room);
    mocks.listPlayers.mockResolvedValue([
      player,
      {
        id: otherPlayerId,
        room_id: roomId,
        name: "Player two",
        muted: false,
        joined_at: "2026-10-27T10:01:00.000Z",
        seat: 1,
      },
    ]);
    mocks.listChatMessagesSince.mockResolvedValue({
      messages: [],
      reset: false,
    });
    mocks.enforceRateLimit.mockResolvedValue(undefined);
  });

  it("returns only the caller's hand in the view projection", async () => {
    const room = mocks.authContext!.room as ReturnType<typeof makeRoom>;
    const response = await GET(
      new Request(`https://kadi.example/api/rooms/${roomId}/view`),
      { params: Promise.resolve({ roomId, action: "view" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.view.players[0].hand).toEqual(room.state.players[0].hand);
    expect(body.view.players[1].hand).toBeNull();
    expect(body).not.toHaveProperty("deck");
    expect(body).not.toHaveProperty("state");
    expect(body).toHaveProperty("serverTime");
    expect(body).toHaveProperty("windowDeadline");
  });

  it("rejects unknown action-body fields", async () => {
    const response = await POST(
      new Request(`https://kadi.example/api/rooms/${roomId}/draw`, {
        method: "POST",
        headers: {
          origin: "https://kadi.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ unexpected: true }),
      }),
      { params: Promise.resolve({ roomId, action: "draw" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_PAYLOAD",
    });
    expect(mocks.updateRoomState).not.toHaveBeenCalled();
  });

  it("checks owner permission on mute before changing a player", async () => {
    const room = makeRoom(otherPlayerId);
    const player = mocks.authContext!.player;
    mocks.authContext = { room, player };
    const response = await POST(
      new Request(`https://kadi.example/api/rooms/${roomId}/mute`, {
        method: "POST",
        headers: {
          origin: "https://kadi.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ playerId: otherPlayerId, muted: true }),
      }),
      { params: Promise.resolve({ roomId, action: "mute" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.updatePlayer).not.toHaveBeenCalled();
  });

  it("starts a lobby game for its owner when at least two players are present", async () => {
    const room = { ...makeRoom(), status: "lobby" as const };
    mocks.authContext = {
      room,
      player: mocks.authContext!.player,
    };
    mocks.getRoom.mockResolvedValue(room);
    mocks.updateRoomState.mockImplementation(
      async (_roomId, version, state, _retries, status) => ({
        ...room,
        state,
        version: version + 1,
        status,
      }),
    );

    const response = await POST(
      new Request(`https://kadi.example/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: {
          origin: "https://kadi.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ roomId, action: "start" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: room.version + 1,
      status: "playing",
    });
    expect(mocks.updateRoomState).toHaveBeenCalledWith(
      roomId,
      room.version,
      expect.objectContaining({ players: expect.any(Array) }),
      0,
      "playing",
    );
  });
});
