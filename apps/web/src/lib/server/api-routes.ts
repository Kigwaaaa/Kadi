import "server-only";

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import {
  getPlayerByGuestToken,
  getRoom,
  type PlayerRecord,
  type RoomRecord,
} from "./kadi-data";

export const GUEST_COOKIE = "kadi_guest";
const GUEST_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export class ApiRouteError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiRouteError";
  }
}

export interface AuthenticatedRoom {
  room: RoomRecord;
  player: PlayerRecord;
  guestToken: string;
}

export function newGuestToken(): string {
  return randomBytes(32).toString("hex");
}

export function guestCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function readGuestToken(request: Request): string | null {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GUEST_COOKIE}=`))
    ?.slice(GUEST_COOKIE.length + 1);
  return token && GUEST_TOKEN_PATTERN.test(token) ? token : null;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    throw new ApiRouteError("FORBIDDEN", 403);
  }
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new ApiRouteError("INVALID_PAYLOAD", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiRouteError("INVALID_PAYLOAD", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiRouteError("INVALID_PAYLOAD", 400);
  return parsed.data;
}

export async function requireRoomPlayer(
  request: Request,
  roomId: string,
): Promise<AuthenticatedRoom> {
  const room = await getRoom(roomId);
  if (!room || room.status === "closed") {
    throw new ApiRouteError("ROOM_NOT_FOUND", 404);
  }

  const guestToken = readGuestToken(request);
  if (!guestToken) throw new ApiRouteError("UNAUTHENTICATED", 401);
  const player = await getPlayerByGuestToken(room.id, guestToken);
  if (!player) throw new ApiRouteError("UNAUTHENTICATED", 401);
  return { room, player, guestToken };
}

export function requireOwner(room: RoomRecord, player: PlayerRecord): void {
  if (room.owner_player_id !== player.id) {
    throw new ApiRouteError("FORBIDDEN", 403);
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiRouteError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  if (error instanceof Error && error.message === "ROOM_VERSION_CONFLICT") {
    return NextResponse.json({ error: "CONFLICT" }, { status: 409 });
  }
  if (error instanceof Error && error.message.endsWith("_NOT_FOUND")) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof Error && error.message === "RATE_LIMITED") {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }
  if (error instanceof Error && error.message === "RATE_LIMIT_UNAVAILABLE") {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
  if (
    error instanceof Error &&
    error.message === "SUPABASE_CONFIGURATION_MISSING"
  ) {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }

  console.error(
    "API request failed.",
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { type: typeof error },
  );
  return NextResponse.json({ error: "REQUEST_FAILED" }, { status: 500 });
}
