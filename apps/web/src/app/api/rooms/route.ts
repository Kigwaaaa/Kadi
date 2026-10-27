import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addPlayer,
  addChatMessage,
  createRoom,
  deleteRoom,
  getRoom,
  setRoomOwner,
} from "../../../lib/server/kadi-data";
import { enforceRateLimit } from "../../../lib/server/api-security";
import {
  ApiRouteError,
  guestCookieOptions,
  jsonError,
  newGuestToken,
  parseJsonBody,
  requireSameOrigin,
} from "../../../lib/server/api-routes";

const createRoomSchema = z
  .object({
    name: z
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
      .pipe(z.string().min(2).max(20)),
  })
  .strict();

function clientIp(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { name } = await parseJsonBody(request, createRoomSchema);
    try {
      await enforceRateLimit("create", clientIp(request));
    } catch (error) {
      return jsonError(error);
    }

    const guestToken = newGuestToken();
    const room = await createRoom();
    try {
      const player = await addPlayer(room.id, name, guestToken, 0);
      const currentRoom = await getRoom(room.id);
      if (!currentRoom) throw new ApiRouteError("ROOM_NOT_FOUND", 404);
      const ownedRoom = await setRoomOwner(
        room.id,
        currentRoom.version,
        player.id,
      );
      await addChatMessage(room.id, null, `${player.name} created the room.`);
      const response = NextResponse.json(
        {
          room: {
            id: ownedRoom.id,
            code: ownedRoom.code,
            status: ownedRoom.status,
            ownerPlayerId: ownedRoom.owner_player_id,
          },
          player: {
            id: player.id,
            name: player.name,
            seat: player.seat,
            muted: player.muted,
          },
        },
        { status: 201 },
      );
      response.cookies.set("kadi_guest", guestToken, guestCookieOptions());
      return response;
    } catch (error) {
      await deleteRoom(room.id);
      throw error;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ROOM_CODE_ALLOCATION_FAILED"
    ) {
      return NextResponse.json(
        { error: "ROOM_CREATE_FAILED" },
        { status: 503 },
      );
    }
    if (error instanceof ApiRouteError) return jsonError(error);
    return jsonError(error);
  }
}
