import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { GameState } from "@kadi/engine";
import { z } from "zod";
import { getSupabaseAdminClient } from "./supabase-admin";
import { publishRoomChanged } from "./room-realtime";

const ROOM_CODE_ATTEMPTS = 100;
const ROOM_IDLE_HOURS = 24;
const roomColumns =
  "id,code,owner_player_id,status,state,version,window_deadline,created_at,updated_at";
const playerColumns = "id,room_id,name,muted,joined_at,seat";
const chatMessageColumns = "id,room_id,player_id,body,created_at";
const guestTokenSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);

const suitSchema = z.enum(["clubs", "diamonds", "hearts", "spades"]);
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
const rankSchema = z.union([
  numberRankSchema,
  z.enum(["J", "Q", "K", "A", "JOKER"]),
]);
const cardSchema = z
  .object({
    id: z.string().uuid(),
    suit: suitSchema.nullable(),
    rank: rankSchema,
  })
  .strict();
const aceRequestSchema = z
  .object({
    byPlayerId: z.string(),
    suit: suitSchema.optional(),
    rank: numberRankSchema.optional(),
    remainingPlayers: z.number().int().nonnegative(),
  })
  .strict();
const gameStateSchema = z
  .object({
    players: z.array(
      z
        .object({
          id: z.string(),
          hand: z.array(cardSchema),
          nikoKadiPressed: z.boolean(),
        })
        .strict(),
    ),
    deck: z.array(cardSchema),
    discard: z.array(cardSchema),
    direction: z.union([z.literal(1), z.literal(-1)]),
    currentPlayerIndex: z.number().int().nonnegative(),
    pendingPenalty: z
      .object({
        amount: z.union([z.literal(2), z.literal(3), z.literal(5)]),
        cardId: z.string(),
      })
      .strict()
      .nullable(),
    activeAceRequest: aceRequestSchema.nullable(),
    pendingKingCounter: z
      .object({ playerId: z.string(), lastPlayerId: z.string() })
      .strict()
      .nullable(),
    pendingJackCounters: z
      .object({
        playerId: z.string(),
        lastPlayerId: z.string(),
        remainingSkips: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    window: z
      .object({
        openedAt: z.number(),
        deadline: z.number(),
        actorId: z.string(),
        nextPlayerId: z.string(),
        actionType: z.enum(["play", "draw", "counter", "ace-choice"]),
        counterKind: z.enum(["king", "jack", "ace"]).nullable(),
      })
      .strict()
      .nullable(),
    nikoKadiFlags: z.record(z.string(), z.boolean()),
    pendingAceChoice: z
      .object({
        chooserId: z.string(),
        responderId: z.string(),
        request: aceRequestSchema,
      })
      .strict()
      .nullable(),
    winner: z.string().nullable(),
    logicalTimeMs: z.number(),
  })
  .strict() satisfies z.ZodType<GameState>;

const roomRecordSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().regex(/^[A-Z][0-9]{4}$/),
    owner_player_id: z.string().uuid().nullable(),
    status: z.enum(["lobby", "playing", "finished", "closed"]),
    state: gameStateSchema.nullable(),
    version: z.number().int().nonnegative(),
    window_deadline: z.string().datetime({ offset: true }).nullable(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

const playerRecordSchema = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    name: z.string().min(2).max(20),
    muted: z.boolean(),
    joined_at: z.string().datetime({ offset: true }),
    seat: z.number().int().nonnegative(),
  })
  .strict();

const chatMessageSchema = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    player_id: z.string().uuid().nullable(),
    body: z.string().min(1).max(300),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

const playerNameSchema = z
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
  .pipe(z.string().min(2).max(20));

const playerInputSchema = z
  .object({
    roomId: z.string().uuid(),
    name: playerNameSchema,
    guestToken: z.string().min(1),
    seat: z.number().int().nonnegative(),
  })
  .strict();

const chatInputSchema = z
  .object({
    roomId: z.string().uuid(),
    playerId: z.string().uuid().nullable(),
    body: z
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

export type RoomRecord = z.infer<typeof roomRecordSchema>;
export type PlayerRecord = z.infer<typeof playerRecordSchema>;
export type ChatMessageRecord = z.infer<typeof chatMessageSchema>;
export type RoomStatus = RoomRecord["status"];
export type GameStateUpdater = (
  currentState: GameState,
  currentRoom?: RoomRecord,
) => GameState;
export type RoomStatusUpdater = (state: GameState) => RoomStatus;

export class RoomVersionConflictError extends Error {
  constructor() {
    super("ROOM_VERSION_CONFLICT");
    this.name = "RoomVersionConflictError";
  }
}

function assertNoError(error: { message: string; code?: string } | null) {
  if (error) {
    throw new Error(`Supabase request failed (${error.code ?? "unknown"}).`);
  }
}

function parseRoom(data: unknown): RoomRecord {
  return roomRecordSchema.parse(data);
}

function roomCode(): string {
  const letter = String.fromCharCode(65 + randomInt(0, 26));
  const digits = randomInt(0, 10_000).toString().padStart(4, "0");
  return `${letter}${digits}`;
}

export async function createRoom(): Promise<RoomRecord> {
  const supabase = getSupabaseAdminClient();
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code: roomCode(), status: "lobby" })
      .select(roomColumns)
      .single();

    if (!error) {
      const room = parseRoom(data);
      await publishRoomChanged(room.id, room.version);
      return room;
    }
    if (error.code !== "23505") assertNoError(error);
  }

  throw new Error("ROOM_CODE_ALLOCATION_FAILED");
}

export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  const id = z.string().uuid().parse(roomId);
  const { data, error } = await getSupabaseAdminClient()
    .from("rooms")
    .select(roomColumns)
    .eq("id", id)
    .maybeSingle();

  assertNoError(error);
  return data === null ? null : parseRoom(data);
}

export async function getRoomByCode(code: string): Promise<RoomRecord | null> {
  const validatedCode = z
    .string()
    .regex(/^[A-Z][0-9]{4}$/)
    .parse(code);
  const { data, error } = await getSupabaseAdminClient()
    .from("rooms")
    .select(roomColumns)
    .eq("code", validatedCode)
    .maybeSingle();

  assertNoError(error);
  return data === null ? null : parseRoom(data);
}

export async function updateRoomState(
  roomId: string,
  expectedVersion: number,
  newState: GameState | GameStateUpdater,
  maxConflictRetries = 3,
  status?: RoomStatus | RoomStatusUpdater,
): Promise<RoomRecord> {
  const id = z.string().uuid().parse(roomId);
  const initialVersion = z.number().int().nonnegative().parse(expectedVersion);
  const retries = z.number().int().min(0).max(10).parse(maxConflictRetries);
  const supabase = getSupabaseAdminClient();
  let version = initialVersion;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let state: GameState;
    let currentRoom: RoomRecord | null = null;
    if (typeof newState === "function") {
      currentRoom = await getRoom(id);
      if (!currentRoom) throw new Error("ROOM_NOT_FOUND");
      version = currentRoom.version;
      if (!currentRoom.state) throw new Error("ROOM_STATE_NOT_INITIALIZED");
      state = newState(currentRoom.state, currentRoom);
    } else {
      state = newState;
    }

    const validatedState = gameStateSchema.parse(state);
    const updatedStatus = typeof status === "function" ? status(state) : status;
    if (
      currentRoom &&
      JSON.stringify(currentRoom.state) === JSON.stringify(validatedState) &&
      (updatedStatus === undefined || updatedStatus === currentRoom.status)
    ) {
      return currentRoom;
    }
    const { data, error } = await supabase
      .from("rooms")
      .update({
        state: validatedState,
        ...(updatedStatus === undefined ? {} : { status: updatedStatus }),
        window_deadline:
          validatedState.window === null
            ? null
            : new Date(validatedState.window.deadline).toISOString(),
        version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("version", version)
      .select(roomColumns)
      .maybeSingle();

    assertNoError(error);
    if (data !== null) {
      const room = parseRoom(data);
      await publishRoomChanged(room.id, room.version);
      return room;
    }

    if (typeof newState !== "function" || attempt === retries) {
      throw new RoomVersionConflictError();
    }
  }

  throw new RoomVersionConflictError();
}

export async function updateRoomStatus(
  roomId: string,
  expectedVersion: number,
  status: RoomStatus,
): Promise<RoomRecord> {
  const id = z.string().uuid().parse(roomId);
  const version = z.number().int().nonnegative().parse(expectedVersion);
  const validatedStatus = z
    .enum(["lobby", "playing", "finished", "closed"])
    .parse(status);
  const { data, error } = await getSupabaseAdminClient()
    .from("rooms")
    .update({
      status: validatedStatus,
      version: version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("version", version)
    .select(roomColumns)
    .maybeSingle();

  assertNoError(error);
  if (data === null) throw new RoomVersionConflictError();
  const room = parseRoom(data);
  await publishRoomChanged(room.id, room.version);
  return room;
}

export async function setRoomOwner(
  roomId: string,
  expectedVersion: number,
  ownerPlayerId: string | null,
): Promise<RoomRecord> {
  const id = z.string().uuid().parse(roomId);
  const version = z.number().int().nonnegative().parse(expectedVersion);
  const ownerId =
    ownerPlayerId === null ? null : z.string().uuid().parse(ownerPlayerId);
  const supabase = getSupabaseAdminClient();

  if (ownerId !== null) {
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id")
      .eq("room_id", id)
      .eq("id", ownerId)
      .maybeSingle();
    assertNoError(playerError);
    if (player === null) throw new Error("OWNER_NOT_IN_ROOM");
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({
      owner_player_id: ownerId,
      version: version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("version", version)
    .select(roomColumns)
    .maybeSingle();

  assertNoError(error);
  if (data === null) throw new RoomVersionConflictError();
  const room = parseRoom(data);
  await publishRoomChanged(room.id, room.version);
  return room;
}

export function hashGuestToken(guestToken: string): string {
  const token = guestTokenSchema.parse(guestToken);
  return createHash("sha256").update(token).digest("hex");
}

export async function addPlayer(
  roomId: string,
  name: string,
  guestToken: string,
  seat: number,
): Promise<PlayerRecord> {
  const input = playerInputSchema.parse({ roomId, name, guestToken, seat });
  const { data, error } = await getSupabaseAdminClient()
    .from("players")
    .insert({
      room_id: input.roomId,
      name: input.name,
      token_hash: hashGuestToken(input.guestToken),
      seat: input.seat,
    })
    .select(playerColumns)
    .single();

  assertNoError(error);
  const player = playerRecordSchema.parse(data);
  await publishRoomChanged(player.room_id);
  return player;
}

export async function getPlayerByGuestToken(
  roomId: string,
  guestToken: string,
): Promise<PlayerRecord | null> {
  const id = z.string().uuid().parse(roomId);
  const tokenHash = hashGuestToken(guestToken);
  const { data, error } = await getSupabaseAdminClient()
    .from("players")
    .select(playerColumns)
    .eq("room_id", id)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  assertNoError(error);
  return data === null ? null : playerRecordSchema.parse(data);
}

export async function listPlayers(roomId: string): Promise<PlayerRecord[]> {
  const id = z.string().uuid().parse(roomId);
  const { data, error } = await getSupabaseAdminClient()
    .from("players")
    .select(playerColumns)
    .eq("room_id", id)
    .order("seat", { ascending: true });

  assertNoError(error);
  return z.array(playerRecordSchema).parse(data);
}

export async function getEarliestPlayer(
  roomId: string,
): Promise<PlayerRecord | null> {
  const id = z.string().uuid().parse(roomId);
  const { data, error } = await getSupabaseAdminClient()
    .from("players")
    .select(playerColumns)
    .eq("room_id", id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  assertNoError(error);
  return data === null ? null : playerRecordSchema.parse(data);
}

export async function updatePlayer(
  roomId: string,
  playerId: string,
  updates: { name?: string; muted?: boolean; seat?: number },
): Promise<PlayerRecord> {
  const id = z.string().uuid().parse(roomId);
  const targetId = z.string().uuid().parse(playerId);
  const validatedUpdates = z
    .object({
      name: playerNameSchema.optional(),
      muted: z.boolean().optional(),
      seat: z.number().int().nonnegative().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0)
    .parse(updates);
  const { data, error } = await getSupabaseAdminClient()
    .from("players")
    .update(validatedUpdates)
    .eq("room_id", id)
    .eq("id", targetId)
    .select(playerColumns)
    .maybeSingle();

  assertNoError(error);
  if (data === null) throw new Error("PLAYER_NOT_FOUND");
  const player = playerRecordSchema.parse(data);
  await publishRoomChanged(player.room_id);
  return player;
}

export async function removePlayer(
  roomId: string,
  playerId: string,
): Promise<boolean> {
  const id = z.string().uuid().parse(roomId);
  const targetId = z.string().uuid().parse(playerId);
  const { data, error } = await getSupabaseAdminClient()
    .from("players")
    .delete()
    .eq("room_id", id)
    .eq("id", targetId)
    .select("id");

  assertNoError(error);
  const removed = z.array(z.object({ id: z.string().uuid() })).parse(data);
  if (removed.length > 0) await publishRoomChanged(id);
  return removed.length > 0;
}

export async function addChatMessage(
  roomId: string,
  playerId: string | null,
  body: string,
): Promise<ChatMessageRecord> {
  const input = chatInputSchema.parse({ roomId, playerId, body });
  const { data, error } = await getSupabaseAdminClient()
    .from("chat_messages")
    .insert({
      room_id: input.roomId,
      player_id: input.playerId,
      body: input.body,
    })
    .select(chatMessageColumns)
    .single();

  assertNoError(error);
  const message = chatMessageSchema.parse(data);
  await publishRoomChanged(message.room_id);
  return message;
}

export async function listChatMessages(
  roomId: string,
  limit = 100,
): Promise<ChatMessageRecord[]> {
  const id = z.string().uuid().parse(roomId);
  const messageLimit = z.number().int().min(1).max(500).parse(limit);
  const { data, error } = await getSupabaseAdminClient()
    .from("chat_messages")
    .select(chatMessageColumns)
    .eq("room_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(messageLimit);

  assertNoError(error);
  return z.array(chatMessageSchema).parse(data);
}

export async function listChatMessagesSince(
  roomId: string,
  afterMessageId: string | null,
  limit = 100,
): Promise<{ messages: ChatMessageRecord[]; reset: boolean }> {
  const id = z.string().uuid().parse(roomId);
  const messageLimit = z.number().int().min(1).max(500).parse(limit);
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("chat_messages")
    .select(chatMessageColumns)
    .eq("room_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(messageLimit);

  if (afterMessageId !== null) {
    const cursor = z.string().uuid().parse(afterMessageId);
    const { data: anchor, error: anchorError } = await supabase
      .from("chat_messages")
      .select("created_at,id")
      .eq("room_id", id)
      .eq("id", cursor)
      .maybeSingle();
    assertNoError(anchorError);
    if (anchor === null) return { messages: [], reset: true };
    const { created_at: createdAt, id: anchorId } = z
      .object({
        created_at: z.string().datetime({ offset: true }),
        id: z.string().uuid(),
      })
      .parse(anchor);
    query = query.or(
      `created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${anchorId})`,
    );
  }

  const { data, error } = await query;
  assertNoError(error);
  return {
    messages: z.array(chatMessageSchema).parse(data),
    reset: false,
  };
}

export async function clearChatMessages(roomId: string): Promise<number> {
  const id = z.string().uuid().parse(roomId);
  const { data, error } = await getSupabaseAdminClient()
    .from("chat_messages")
    .delete()
    .eq("room_id", id)
    .select("id");

  assertNoError(error);
  const removed = z.array(z.object({ id: z.string().uuid() })).parse(data);
  if (removed.length > 0) await publishRoomChanged(id);
  return removed.length;
}

export async function cleanupIdleRooms(
  now = new Date(),
): Promise<{ deletedRoomIds: string[] }> {
  const date = z.date().parse(now);
  const cutoff = new Date(
    date.getTime() - ROOM_IDLE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from("rooms")
    .delete()
    .or(`status.eq.finished,updated_at.lt.${cutoff}`)
    .select("id,version");

  assertNoError(error);
  const deleted = z
    .array(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().nonnegative(),
      }),
    )
    .parse(data);
  await Promise.all(
    deleted.map(({ id: deletedRoomId, version }) =>
      publishRoomChanged(deletedRoomId, version + 1),
    ),
  );
  return { deletedRoomIds: deleted.map((room) => room.id) };
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  const id = z.string().uuid().parse(roomId);
  const { data, error } = await getSupabaseAdminClient()
    .from("rooms")
    .delete()
    .eq("id", id)
    .select("id,version");

  assertNoError(error);
  const deleted = z
    .array(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().nonnegative(),
      }),
    )
    .parse(data);
  if (deleted[0]) {
    await publishRoomChanged(deleted[0].id, deleted[0].version + 1);
  }
  return deleted.length > 0;
}
