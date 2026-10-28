import {
  applyAction,
  closeWindowByDeadline,
  createGame,
  getLegalMoves,
  getPlayerView,
  type GameAction,
  type GameState,
} from "@kadi/engine";
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addChatMessage,
  clearChatMessages,
  deleteRoom,
  getEarliestPlayer,
  getRoom,
  listChatMessagesSince,
  listPlayers,
  removePlayer,
  setRoomOwner,
  updatePlayer,
  updateRoomState,
  updateRoomStatus,
} from "../../../../../lib/server/kadi-data";
import { enforceRateLimit } from "../../../../../lib/server/api-security";
import {
  ApiRouteError,
  jsonError,
  parseJsonBody,
  requireOwner,
  requireRoomPlayer,
  requireSameOrigin,
} from "../../../../../lib/server/api-routes";

type RouteContext = {
  params: Promise<{ roomId: string; action: string }>;
};

const emptyBodySchema = z.object({}).strict();
const roomIdSchema = z.string().uuid();
const playerIdBodySchema = z.object({ playerId: z.string().uuid() }).strict();
const muteBodySchema = z
  .object({ playerId: z.string().uuid(), muted: z.boolean() })
  .strict();
const numberRankSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
]);
const aceChoiceSchema = z
  .object({
    suit: z.enum(["clubs", "diamonds", "hearts", "spades"]).optional(),
    rank: numberRankSchema.optional(),
  })
  .strict();
const playBodySchema = z
  .object({
    cardIds: z.array(z.string().uuid()).min(1),
    aceRequest: aceChoiceSchema.optional(),
  })
  .strict();
const counterBodySchema = z
  .object({
    kind: z.enum(["king", "jack", "ace"]),
    cardIds: z.array(z.string().uuid()).min(1).max(2),
  })
  .strict();
const aceChoiceBodySchema = z
  .object({ forgo: z.enum(["suit", "rank"]) })
  .strict();
const chatBodySchema = z
  .object({
    text: z
      .string()
      .transform((value) =>
        [...value]
          .filter((character) => {
            const code = character.charCodeAt(0);
            return !(code < 32 || (code >= 127 && code <= 159));
          })
          .join("")
          .trim(),
      )
      .pipe(z.string().min(1).max(300)),
  })
  .strict();

function randomUnit(): number {
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

function clientIp(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

async function routeParams(context: RouteContext) {
  const parsed = z
    .object({
      roomId: roomIdSchema,
      action: z.enum([
        "view",
        "tick",
        "leave",
        "kick",
        "mute",
        "start",
        "end",
        "restart",
        "play",
        "draw",
        "counter",
        "niko-kadi",
        "choose-ace-request",
        "chat",
      ]),
    })
    .strict()
    .safeParse(await context.params);
  if (!parsed.success) throw new ApiRouteError("NOT_FOUND", 404);
  return parsed.data;
}

async function resolveExpiredWindow(roomId: string): Promise<boolean> {
  const room = await getRoom(roomId);
  const now = Date.now();
  if (
    !room ||
    room.status !== "playing" ||
    !room.state?.window ||
    now < room.state.window.deadline
  ) {
    return false;
  }

  const updated = await updateRoomState(
    roomId,
    room.version,
    (state, currentRoom) => {
      if (currentRoom?.status !== "playing" || !state.window) return state;
      const currentTime = Math.max(Date.now(), state.logicalTimeMs);
      if (currentTime < state.window.deadline) return state;
      const result = closeWindowByDeadline(state, currentTime);
      if (!result.ok) throw new ApiRouteError("WINDOW_NOT_EXPIRED", 409);
      return result.state;
    },
  );
  return updated.version !== room.version;
}

async function getPlayerContext(request: Request, roomId: string) {
  await requireRoomPlayer(request, roomId);
  await resolveExpiredWindow(roomId);
  const current = await requireRoomPlayer(request, roomId);
  return current;
}

async function limitAction(request: Request, playerId: string, isNiko = false) {
  await enforceRateLimit("actionIp", clientIp(request));
  await enforceRateLimit("actionPlayer", playerId);
  if (isNiko) await enforceRateLimit("nikoPlayer", playerId);
}

function removePlayerFromState(state: GameState, playerId: string): GameState {
  const removedIndex = state.players.findIndex(
    (player) => player.id === playerId,
  );
  if (removedIndex < 0) return state;

  const removedPlayer = state.players[removedIndex]!;
  const remainingPlayers = state.players.filter(
    (player) => player.id !== playerId,
  );
  const oldCurrentPlayerId = state.players[state.currentPlayerIndex]?.id;
  let currentPlayerId =
    oldCurrentPlayerId === playerId ? null : (oldCurrentPlayerId ?? null);
  if (currentPlayerId === null && remainingPlayers.length > 0) {
    for (let step = 1; step <= state.players.length; step += 1) {
      const index =
        (((removedIndex + state.direction * step) % state.players.length) +
          state.players.length) %
        state.players.length;
      const candidate = state.players[index]!;
      if (candidate.id !== playerId) {
        currentPlayerId = candidate.id;
        break;
      }
    }
  }
  const currentPlayerIndex = Math.max(
    0,
    remainingPlayers.findIndex((player) => player.id === currentPlayerId),
  );
  const pendingAceChoice =
    state.pendingAceChoice?.chooserId === playerId ||
    state.pendingAceChoice?.responderId === playerId
      ? null
      : state.pendingAceChoice;
  return {
    ...state,
    players: remainingPlayers,
    deck: [...state.deck, ...removedPlayer.hand],
    currentPlayerIndex,
    window:
      state.window?.actorId === playerId ||
      state.window?.nextPlayerId === playerId
        ? null
        : state.window,
    pendingKingCounter:
      state.pendingKingCounter?.playerId === playerId ||
      state.pendingKingCounter?.lastPlayerId === playerId
        ? null
        : state.pendingKingCounter,
    pendingJackCounters:
      state.pendingJackCounters?.playerId === playerId ||
      state.pendingJackCounters?.lastPlayerId === playerId
        ? null
        : state.pendingJackCounters,
    activeAceRequest:
      state.activeAceRequest?.byPlayerId === playerId
        ? null
        : state.activeAceRequest,
    pendingAceChoice,
    nikoKadiFlags: Object.fromEntries(
      Object.entries(state.nikoKadiFlags).filter(([id]) => id !== playerId),
    ),
  };
}

async function removeRoomPlayer(
  roomId: string,
  playerId: string,
  message: string,
) {
  const room = await getRoom(roomId);
  if (!room) throw new ApiRouteError("ROOM_NOT_FOUND", 404);
  const beforePlayers = await listPlayers(roomId);
  const departingPlayer = beforePlayers.find((item) => item.id === playerId);
  if (!departingPlayer) throw new ApiRouteError("INVALID_TARGET", 404);
  await addChatMessage(
    roomId,
    null,
    message.replace("{name}", departingPlayer.name),
  );

  if (room.state) {
    await updateRoomState(room.id, room.version, (state) =>
      removePlayerFromState(state, playerId),
    );
  }
  await removePlayer(room.id, playerId);

  const players = await listPlayers(room.id);
  if (players.length === 0) {
    await deleteRoom(room.id);
    return { closed: true, ownerPlayerId: null };
  }

  let updatedRoom = await getRoom(room.id);
  if (!updatedRoom) return { closed: true, ownerPlayerId: null };
  let ownerPlayerId = updatedRoom.owner_player_id;
  if (ownerPlayerId === playerId) {
    const earliest = await getEarliestPlayer(room.id);
    ownerPlayerId = earliest?.id ?? null;
    updatedRoom = await setRoomOwner(
      room.id,
      updatedRoom.version,
      ownerPlayerId,
    );
  }
  if (players.length < 2 && updatedRoom.status !== "closed") {
    updatedRoom = await updateRoomStatus(
      room.id,
      updatedRoom.version,
      "closed",
    );
  }
  return {
    closed: updatedRoom.status === "closed",
    ownerPlayerId: updatedRoom.owner_player_id,
  };
}

async function getAction(request: Request, roomId: string, action: string) {
  if (action !== "view") throw new ApiRouteError("NOT_FOUND", 404);
  const query = new URL(request.url).searchParams;
  for (const key of query.keys()) {
    if (key !== "since") throw new ApiRouteError("INVALID_PAYLOAD", 400);
  }
  const sinceValues = query.getAll("since");
  if (sinceValues.length > 1) throw new ApiRouteError("INVALID_PAYLOAD", 400);
  const since =
    sinceValues.length === 0 || sinceValues[0] === ""
      ? null
      : z.string().uuid().parse(sinceValues[0]);
  const { room, player } = await getPlayerContext(request, roomId);
  const players = await listPlayers(room.id);
  const names = new Map(players.map((item) => [item.id, item.name]));
  const chat = await listChatMessagesSince(room.id, since);
  const messages = chat.messages.map((message) => ({
    id: message.id,
    type: message.player_id ? ("player" as const) : ("system" as const),
    playerId: message.player_id,
    name: message.player_id ? (names.get(message.player_id) ?? "Player") : null,
    text: message.body,
    sentAt: new Date(message.created_at).getTime(),
  }));
  if (!room.state || room.status === "lobby") {
    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        ownerPlayerId: room.owner_player_id,
      },
      players: players.map(({ id, name, seat, muted }) => ({
        id,
        name,
        seat,
        muted,
      })),
      game: null,
      serverTime: Date.now(),
      windowDeadline: null,
      chat: messages,
      chatReset: chat.reset,
    });
  }

  const view = getPlayerView(room.state, player.id);
  const legalMoves = getLegalMoves(room.state, player.id);
  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      ownerPlayerId: room.owner_player_id,
    },
    players: players.map(({ id, name, seat, muted }) => ({
      id,
      name,
      seat,
      muted,
    })),
    view: {
      ...view,
      players: view.players.map((item) => ({
        ...item,
        name: names.get(item.id) ?? "Player",
      })),
    },
    legalMoves,
    serverTime: Date.now(),
    windowDeadline: room.window_deadline,
    chat: messages,
    chatReset: chat.reset,
  });
}

async function runGameAction(
  request: Request,
  roomId: string,
  playerId: string,
  action: GameAction,
) {
  const updated = await updateRoomState(
    roomId,
    (await getRoom(roomId))?.version ?? 0,
    (state, room) => {
      if (room?.status !== "playing") {
        throw new ApiRouteError("GAME_NOT_ACTIVE", 409);
      }
      const actionTime = Math.max(Date.now(), state.logicalTimeMs);
      let actionableState = state;
      if (state.window && actionTime >= state.window.deadline) {
        const closed = closeWindowByDeadline(state, actionTime);
        if (!closed.ok) throw new ApiRouteError("ACTION_REJECTED", 409);
        actionableState = closed.state;
      }

      const result = applyAction(actionableState, playerId, action, {
        nowMs: actionTime,
        rng: randomUnit,
      });
      if (!result.ok) {
        if (result.error.code === "DECK_EXHAUSTED") {
          throw new ApiRouteError("DECK_EXHAUSTED", 409);
        }
        throw new ApiRouteError("ACTION_REJECTED", 409);
      }
      const nextState = result.state;
      if (nextState.window) {
        nextState.window = {
          ...nextState.window,
          openedAt: actionTime,
          deadline: actionTime + 5_000,
        };
      }
      return nextState;
    },
    3,
    (state) => (state.winner ? "finished" : "playing"),
  );

  if (updated.state?.winner) await clearChatMessages(roomId);
  return NextResponse.json({
    version: updated.version,
    status: updated.status,
    windowDeadline: updated.window_deadline,
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { roomId, action } = await routeParams(context);
    return await getAction(request, roomId, action);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const { roomId, action } = await routeParams(context);
    if (action === "tick") {
      const { player } = await requireRoomPlayer(request, roomId);
      const before = await getRoom(roomId);
      if (!before) throw new ApiRouteError("ROOM_NOT_FOUND", 404);
      await parseJsonBody(request, emptyBodySchema);
      await limitAction(request, player.id);
      await resolveExpiredWindow(roomId);
      const after = await getRoom(roomId);
      return NextResponse.json({
        changed: (after?.version ?? before.version) !== before.version,
        version: after?.version ?? before.version,
      });
    }
    const { room, player } = await getPlayerContext(request, roomId);

    if (action === "leave") {
      await parseJsonBody(request, emptyBodySchema);
      await limitAction(request, player.id);
      const result = await removeRoomPlayer(
        roomId,
        player.id,
        "{name} left the room.",
      );
      return NextResponse.json(result);
    }

    if (action === "kick") {
      requireOwner(room, player);
      await limitAction(request, player.id);
      const { playerId } = await parseJsonBody(request, playerIdBodySchema);
      if (playerId === player.id) {
        throw new ApiRouteError("INVALID_TARGET", 400);
      }
      const players = await listPlayers(roomId);
      if (!players.some((item) => item.id === playerId)) {
        throw new ApiRouteError("INVALID_TARGET", 404);
      }
      const result = await removeRoomPlayer(
        roomId,
        playerId,
        "{name} was removed from the room.",
      );
      return NextResponse.json(result);
    }

    if (action === "mute") {
      requireOwner(room, player);
      await limitAction(request, player.id);
      const { playerId, muted } = await parseJsonBody(request, muteBodySchema);
      if (!(await listPlayers(roomId)).some((item) => item.id === playerId)) {
        throw new ApiRouteError("INVALID_TARGET", 404);
      }
      const updated = await updatePlayer(roomId, playerId, { muted });
      await addChatMessage(
        roomId,
        null,
        `${updated.name} was ${muted ? "muted" : "unmuted"} in chat.`,
      );
      return NextResponse.json({
        player: { id: updated.id, name: updated.name, muted: updated.muted },
      });
    }

    if (action === "start" || action === "restart") {
      requireOwner(room, player);
      await limitAction(request, player.id);
      await parseJsonBody(request, emptyBodySchema);
      if (action === "start" && room.status !== "lobby") {
        throw new ApiRouteError("START_REJECTED", 409);
      }
      if (action === "restart" && room.status === "closed") {
        throw new ApiRouteError("ROOM_CLOSED", 409);
      }
      const players = await listPlayers(roomId);
      if (players.length < 2 || players.length > 6) {
        throw new ApiRouteError("START_REJECTED", 409);
      }
      const state = createGame(
        players.map((item) => item.id),
        randomUnit,
      );
      const updated = await updateRoomState(
        roomId,
        room.version,
        state,
        0,
        "playing",
      );
      if (action === "restart") await clearChatMessages(roomId);
      return NextResponse.json({
        version: updated.version,
        status: updated.status,
      });
    }

    if (action === "end") {
      requireOwner(room, player);
      await limitAction(request, player.id);
      await parseJsonBody(request, emptyBodySchema);
      const updated = await updateRoomStatus(roomId, room.version, "finished");
      await clearChatMessages(roomId);
      return NextResponse.json({
        version: updated.version,
        status: updated.status,
      });
    }

    if (action === "chat") {
      await enforceRateLimit("chatIp", clientIp(request));
      await enforceRateLimit("chatPlayer", player.id);
      const { text } = await parseJsonBody(request, chatBodySchema);
      if (room.status === "finished") {
        throw new ApiRouteError("GAME_FINISHED", 409);
      }
      if (player.muted) return new NextResponse(null, { status: 204 });
      const message = await addChatMessage(roomId, player.id, text);
      return NextResponse.json(
        {
          id: message.id,
          type: "player",
          playerId: message.player_id,
          name: player.name,
          text: message.body,
          sentAt: new Date(message.created_at).getTime(),
        },
        { status: 201 },
      );
    }

    if (room.status !== "playing") {
      throw new ApiRouteError("GAME_NOT_ACTIVE", 409);
    }
    await limitAction(request, player.id, action === "niko-kadi");

    if (action === "play") {
      const body = await parseJsonBody(request, playBodySchema);
      return await runGameAction(request, roomId, player.id, {
        type: "play",
        ...body,
      });
    }
    if (action === "draw") {
      await parseJsonBody(request, emptyBodySchema);
      return await runGameAction(request, roomId, player.id, { type: "draw" });
    }
    if (action === "counter") {
      const body = await parseJsonBody(request, counterBodySchema);
      return await runGameAction(request, roomId, player.id, {
        type: "counter",
        ...body,
      });
    }
    if (action === "niko-kadi") {
      await parseJsonBody(request, emptyBodySchema);
      return await runGameAction(request, roomId, player.id, {
        type: "nikoKadi",
      });
    }
    if (action === "choose-ace-request") {
      const body = await parseJsonBody(request, aceChoiceBodySchema);
      return await runGameAction(request, roomId, player.id, {
        type: "chooseAceRequest",
        ...body,
      });
    }
    throw new ApiRouteError("NOT_FOUND", 404);
  } catch (error) {
    return jsonError(error);
  }
}
