"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const suitSchema = z.enum(["clubs", "diamonds", "hearts", "spades"]);
const cardSchema = z.object({
  id: z.string(),
  rank: z.union([z.number(), z.string()]),
  suit: suitSchema.nullable(),
});
const legalMoveSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("play"),
      cardIds: z.array(z.string().min(1)).min(1),
      aceRequest: z
        .object({
          suit: suitSchema.optional(),
          rank: z.number().int().min(2).max(10).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("draw") }).strict(),
  z
    .object({
      type: z.literal("counter"),
      kind: z.enum(["king", "jack", "ace"]),
      cardIds: z.array(z.string().min(1)).min(1).max(2),
    })
    .strict(),
  z.object({ type: z.literal("nikoKadi") }).strict(),
  z
    .object({
      type: z.literal("chooseAceRequest"),
      forgo: z.enum(["suit", "rank"]),
    })
    .strict(),
]);
const playerViewSchema = z.object({
  legalMoves: z.array(legalMoveSchema),
  players: z.array(
    z.object({
      id: z.string().uuid(),
      hand: z.array(cardSchema).nullable(),
      cardCount: z.number().int().nonnegative(),
      nikoKadiPressed: z.boolean(),
    }),
  ),
  deckCount: z.number().int().nonnegative(),
  discard: z.array(cardSchema),
  direction: z.union([z.literal(1), z.literal(-1)]),
  currentPlayerId: z.string().uuid(),
  pendingPenalty: z
    .object({ amount: z.union([z.literal(2), z.literal(3), z.literal(5)]) })
    .nullable(),
  activeAceRequest: z
    .object({
      byPlayerId: z.string().uuid(),
      suit: suitSchema.optional(),
      rank: z.number().optional(),
      remainingPlayers: z.number().int(),
    })
    .nullable(),
  window: z
    .object({
      openedAt: z.number(),
      deadline: z.number(),
      actorId: z.string().uuid(),
      nextPlayerId: z.string().uuid(),
      actionType: z.string(),
      counterKind: z.string().nullable(),
    })
    .nullable(),
  pendingKingCounter: z
    .object({ playerId: z.string().uuid(), lastPlayerId: z.string().uuid() })
    .nullable(),
  pendingJackCounters: z
    .object({
      playerId: z.string().uuid(),
      lastPlayerId: z.string().uuid(),
      remainingSkips: z.number().int(),
    })
    .nullable(),
  pendingAceChoice: z
    .object({
      chooserId: z.string().uuid(),
      responderId: z.string().uuid(),
      request: z.object({
        byPlayerId: z.string().uuid(),
        suit: suitSchema.optional(),
        rank: z.number().int().min(2).max(10).optional(),
        remainingPlayers: z.number().int(),
      }),
    })
    .nullable(),
  winner: z.string().uuid().nullable(),
});
const chatMessageSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["player", "system"]),
    playerId: z.string().uuid().nullable(),
    name: z.string().nullable(),
    text: z.string().min(1).max(300),
    sentAt: z.number(),
  })
  .strict();

export interface RoomState {
  code: string;
  ownerId: string;
  started: boolean;
  ended: boolean;
  players: Array<{
    id: string;
    name: string;
    muted: boolean;
    connected: boolean;
  }>;
}
export type PrivateGameView = z.infer<typeof playerViewSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ServerErrorCode =
  | "INVALID_PAYLOAD"
  | "RATE_LIMITED"
  | "ALREADY_IN_ROOM"
  | "ROOM_NOT_FOUND"
  | "ROOM_CLOSED"
  | "ROOM_FULL"
  | "NAME_TAKEN"
  | "FORBIDDEN"
  | "INVALID_TARGET"
  | "START_REJECTED"
  | "GAME_ACTION_REJECTED"
  | "GAME_NOT_ACTIVE"
  | "RESTART_REJECTED"
  | "UNAUTHENTICATED"
  | "CONFLICT"
  | "ACTION_REJECTED"
  | "GAME_FINISHED"
  | "SERVICE_UNAVAILABLE"
  | "REQUEST_FAILED";

export interface AckResult {
  ok: boolean;
  code?: ServerErrorCode;
  roomCode?: string;
}

export interface ClientToServerEvents {
  "room:create": (payload: { name: string }) => void;
  "room:join": (payload: { name: string; code: string }) => void;
  "room:leave": (payload: Record<string, never>) => void;
  "room:kick": (payload: { playerId: string }) => void;
  "room:mute": (payload: { playerId: string; muted: boolean }) => void;
  "game:start": (payload: Record<string, never>) => void;
  "game:end": (payload: Record<string, never>) => void;
  "game:restart": (payload: Record<string, never>) => void;
  "game:play": (payload: {
    cardIds: string[];
    aceRequest?: { suit?: string; rank?: number };
  }) => void;
  "game:draw": (payload: Record<string, never>) => void;
  "game:counter": (payload: {
    kind: "king" | "jack" | "ace";
    cardIds: string[];
  }) => void;
  "game:chooseAceRequest": (payload: { forgo: "suit" | "rank" }) => void;
  "game:nikoKadi": (payload: Record<string, never>) => void;
  "chat:send": (payload: { text: string }) => void;
}

type RoomContext = {
  id: string;
  code: string;
  ownerId: string;
  started: boolean;
  ended: boolean;
  players: RoomState["players"];
};
type ApiRoom = {
  id: string;
  code: string;
  status: string;
  ownerPlayerId: string | null;
};
type ApiPlayer = { id: string; name: string; seat: number; muted: boolean };
type ApiChatMessage = {
  id: string;
  room_id: string;
  player_id: string | null;
  body: string;
  created_at: string;
};
const apiRoomSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().regex(/^[A-Z][0-9]{4}$/),
    status: z.enum(["lobby", "playing", "finished", "closed"]),
    ownerPlayerId: z.string().uuid().nullable(),
  })
  .strict();
const apiPlayerSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(2).max(20),
    seat: z.number().int().nonnegative(),
    muted: z.boolean(),
  })
  .strict();
const apiChatSchema = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    player_id: z.string().uuid().nullable(),
    body: z.string().min(1).max(300),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
const roomChangeSchema = z
  .object({
    type: z.literal("changed"),
    version: z.number().int().nonnegative(),
  })
  .strict();
function parseRoom(room: ApiRoom, players: ApiPlayer[]): RoomContext {
  return {
    id: room.id,
    code: room.code,
    ownerId: room.ownerPlayerId ?? "",
    started: room.status === "playing" || room.status === "finished",
    ended: room.status === "finished",
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      muted: player.muted,
      connected: true,
    })),
  };
}

function parseChat(
  messages: ApiChatMessage[],
  names: Map<string, string>,
): ChatMessage[] {
  return z.array(chatMessageSchema).parse(
    messages.map((message) => ({
      id: message.id,
      type: message.player_id ? "player" : "system",
      playerId: message.player_id,
      name: message.player_id
        ? (names.get(message.player_id) ?? "Player")
        : null,
      text: message.body,
      sentAt: new Date(message.created_at).getTime(),
    })),
  );
}

function endpointForEvent(
  event: keyof ClientToServerEvents,
  roomId: string | null,
): { path: string; body: unknown; createsRoom?: boolean } | null {
  if (event === "room:create") {
    return { path: "/api/rooms", body: undefined, createsRoom: true };
  }
  if (event === "room:join") {
    return { path: "/api/rooms/join", body: undefined, createsRoom: true };
  }
  if (!roomId) return null;

  const actionByEvent: Partial<Record<keyof ClientToServerEvents, string>> = {
    "room:leave": "leave",
    "room:kick": "kick",
    "room:mute": "mute",
    "game:start": "start",
    "game:end": "end",
    "game:restart": "restart",
    "game:play": "play",
    "game:draw": "draw",
    "game:counter": "counter",
    "game:chooseAceRequest": "choose-ace-request",
    "game:nikoKadi": "niko-kadi",
    "chat:send": "chat",
  };
  const action = actionByEvent[event];
  return action
    ? { path: `/api/rooms/${roomId}/${action}`, body: undefined }
    : null;
}

export type KadiEmit = <E extends keyof ClientToServerEvents>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
) => Promise<AckResult>;

export function useKadiApi() {
  const [room, setRoom] = useState<RoomContext | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameView, setGameView] = useState<PrivateGameView | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "realtime" | "polling" | "reconnecting"
  >("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const roomRef = useRef(room);
  const cursorRef = useRef<string | null>(null);
  const windowDeadlineRef = useRef<number | null>(null);
  const serverTimeOffsetRef = useRef(0);
  const tickInProgressRef = useRef(false);
  const refreshingRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshRoomRef = useRef<() => Promise<void>>(async () => {});
  roomRef.current = room;

  const clearRoom = useCallback(() => {
    setRoom(null);
    setPlayerId(null);
    setGameView(null);
    setChatMessages([]);
    cursorRef.current = null;
    windowDeadlineRef.current = null;
    setServerTimeOffsetMs(0);
  }, []);

  const refreshRoom = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return;
    if (refreshingRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshingRef.current = true;

    try {
      const requestStartedAt = Date.now();
      const query = cursorRef.current
        ? `?since=${encodeURIComponent(cursorRef.current)}`
        : "";
      const response = await fetch(
        `/api/rooms/${currentRoom.id}/view${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (response.status === 401 || response.status === 404) {
          setConnectionError("UNAUTHENTICATED");
          clearRoom();
          return;
        }
        throw new Error(result?.error ?? "REQUEST_FAILED");
      }
      const payload = (await response.json()) as {
        room: unknown;
        players: unknown;
        view?: unknown;
        legalMoves?: unknown;
        chat: unknown;
        chatReset?: unknown;
        serverTime: unknown;
      };
      const requestFinishedAt = Date.now();
      const serverTime = z.number().finite().parse(payload.serverTime);
      const offset = serverTime - (requestStartedAt + requestFinishedAt) / 2;
      serverTimeOffsetRef.current = offset;
      setServerTimeOffsetMs(offset);
      const roomData = apiRoomSchema.parse(payload.room);
      const players = z.array(apiPlayerSchema).parse(payload.players);
      const parsedRoom = parseRoom(roomData, players);
      setRoom(parsedRoom);
      if (payload.view) {
        const parsedView = playerViewSchema.parse({
          ...(payload.view as Record<string, unknown>),
          legalMoves: z.array(legalMoveSchema).parse(payload.legalMoves),
        });
        windowDeadlineRef.current = parsedView.window?.deadline ?? null;
        setGameView(parsedView);
      } else {
        windowDeadlineRef.current = null;
        setGameView(null);
      }
      const names = new Map(players.map((player) => [player.id, player.name]));
      const chatRecords = z.array(apiChatSchema).parse(payload.chat);
      const newMessages = parseChat(chatRecords, names);
      if (payload.chatReset === true) {
        setChatMessages([]);
        cursorRef.current = null;
      }
      setChatMessages((current) => {
        const base = payload.chatReset === true ? [] : current;
        const knownIds = new Set(base.map((message) => message.id));
        const combined = [
          ...base,
          ...newMessages.filter((message) => !knownIds.has(message.id)),
        ];
        if (combined.length > 500) combined.splice(0, combined.length - 500);
        return combined;
      });
      if (newMessages.length > 0) {
        cursorRef.current = newMessages[newMessages.length - 1]!.id;
      }
      setConnected(true);
      setConnectionError(null);
      setConnectionStatus((current) =>
        current === "realtime" ? current : "polling",
      );
    } catch (error) {
      setConnected(false);
      setConnectionStatus("reconnecting");
      setConnectionError(
        error instanceof Error ? error.message : "REQUEST_FAILED",
      );
    } finally {
      refreshingRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        globalThis.setTimeout(() => void refreshRoomRef.current(), 0);
      }
    }
  }, [clearRoom]);
  refreshRoomRef.current = refreshRoom;

  useEffect(() => {
    if (!room) return;
    const roomId = room.id;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let pollingInterval: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const startPolling = () => {
      if (disposed || pollingInterval) return;
      setConnectionStatus("polling");
      void refreshRoom();
      pollingInterval = globalThis.setInterval(() => void refreshRoom(), 2_000);
    };

    void refreshRoom();
    if (!supabaseUrl || !supabaseAnonKey) {
      startPolling();
      return () => {
        disposed = true;
        if (pollingInterval) globalThis.clearInterval(pollingInterval);
      };
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const channel = supabase
      .channel(roomId)
      .on("broadcast", { event: "changed" }, (message) => {
        const change = roomChangeSchema.safeParse(message.payload);
        if (!change.success) return;
        void refreshRoom();
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          if (pollingInterval) {
            globalThis.clearInterval(pollingInterval);
            pollingInterval = undefined;
          }
          setConnectionStatus("realtime");
          void refreshRoom();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          startPolling();
        }
      });

    return () => {
      disposed = true;
      if (pollingInterval) globalThis.clearInterval(pollingInterval);
      void supabase.removeChannel(channel);
    };
  }, [room?.id, refreshRoom]);

  useEffect(() => {
    const roomId = room?.id;
    const deadline = gameView?.window?.deadline;
    if (!roomId || deadline === undefined || deadline === null) return;

    let timeout: ReturnType<typeof setTimeout>;
    const tickWhenExpired = async () => {
      const remaining = deadline - (Date.now() + serverTimeOffsetRef.current);
      if (remaining > 0) {
        timeout = globalThis.setTimeout(tickWhenExpired, remaining);
        return;
      }
      if (tickInProgressRef.current) return;
      tickInProgressRef.current = true;
      try {
        const response = await fetch(`/api/rooms/${roomId}/tick`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        if (!response.ok) throw new Error("REQUEST_FAILED");
        await refreshRoom();
      } catch {
        setConnected(false);
        setConnectionStatus("reconnecting");
        setConnectionError("REQUEST_FAILED");
      } finally {
        tickInProgressRef.current = false;
      }
    };

    timeout = globalThis.setTimeout(
      tickWhenExpired,
      Math.max(0, deadline - (Date.now() + serverTimeOffsetRef.current)),
    );
    return () => globalThis.clearTimeout(timeout);
  }, [gameView?.window?.deadline, refreshRoom, room?.id]);

  const emit: KadiEmit = useCallback(
    async (event, payload) => {
      const route = endpointForEvent(event, roomRef.current?.id ?? null);
      if (!route) return { ok: false, code: "REQUEST_FAILED" };

      try {
        const response = await fetch(route.path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          return {
            ok: false,
            code: (result?.error ?? "REQUEST_FAILED") as ServerErrorCode,
          };
        }
        if (response.status === 204) return { ok: true };

        const result = (await response.json()) as {
          room?: ApiRoom;
          player?: ApiPlayer;
        };
        if (route.createsRoom && result.room && result.player) {
          setRoom(parseRoom(result.room, [result.player]));
          setPlayerId(result.player.id);
          setGameView(null);
          setChatMessages([]);
          cursorRef.current = null;
          setConnected(true);
          setConnectionError(null);
        } else if (event === "room:leave") {
          clearRoom();
        } else {
          await refreshRoom();
        }
        return { ok: true, roomCode: result.room?.code };
      } catch {
        setConnected(false);
        return { ok: false, code: "REQUEST_FAILED" };
      }
    },
    [clearRoom, refreshRoom],
  );

  const clearChat = useCallback(() => {
    setChatMessages([]);
    cursorRef.current = null;
  }, []);

  return {
    room,
    playerId,
    gameView,
    connected,
    connectionStatus,
    connectionError,
    serverTimeOffsetMs,
    chatMessages,
    clearChat,
    clearRoom,
    emit,
    refreshRoom,
  };
}
