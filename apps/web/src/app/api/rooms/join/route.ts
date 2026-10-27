import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addPlayer,
  addChatMessage,
  getPlayerByGuestToken,
  getRoomByCode,
  getRoom,
  listPlayers,
  removePlayer,
  setRoomOwner,
} from "../../../../lib/server/kadi-data";
import { enforceRateLimit } from "../../../../lib/server/api-security";
import {
  ApiRouteError,
  guestCookieOptions,
  jsonError,
  newGuestToken,
  parseJsonBody,
  readGuestToken,
  requireSameOrigin,
} from "../../../../lib/server/api-routes";

const joinRoomSchema = z
  .object({
    code: z.string().regex(/^[A-Z][0-9]{4}$/),
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
    const { code, name } = await parseJsonBody(request, joinRoomSchema);
    await enforceRateLimit("joinIp", clientIp(request));
    await enforceRateLimit("joinCode", code);

    const room = await getRoomByCode(code);
    if (!room || room.status === "closed") {
      throw new ApiRouteError("ROOM_NOT_FOUND", 404);
    }

    const existingToken = readGuestToken(request);
    const existingPlayer = existingToken
      ? await getPlayerByGuestToken(room.id, existingToken)
      : null;
    if (existingPlayer) {
      const response = NextResponse.json({
        room: {
          id: room.id,
          code: room.code,
          status: room.status,
          ownerPlayerId: room.owner_player_id,
        },
        player: {
          id: existingPlayer.id,
          name: existingPlayer.name,
          seat: existingPlayer.seat,
          muted: existingPlayer.muted,
        },
      });
      response.cookies.set("kadi_guest", existingToken!, guestCookieOptions());
      return response;
    }
    if (room.status !== "lobby") throw new ApiRouteError("ROOM_CLOSED", 409);

    const guestToken = existingToken ?? newGuestToken();
    let player;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const players = await listPlayers(room.id);
      if (
        players.some(
          (existing) => existing.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new ApiRouteError("NAME_TAKEN", 409);
      }
      if (players.length >= 6) throw new ApiRouteError("ROOM_FULL", 409);
      const occupiedSeats = new Set(players.map((item) => item.seat));
      const seat = [0, 1, 2, 3, 4, 5].find(
        (candidate) => !occupiedSeats.has(candidate),
      );
      if (seat === undefined) throw new ApiRouteError("ROOM_FULL", 409);
      try {
        player = await addPlayer(room.id, name, guestToken, seat);
        break;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/23505|23514/.test(error.message) ||
          attempt === 2
        ) {
          throw error;
        }
      }
    }
    if (!player) throw new ApiRouteError("JOIN_FAILED", 409);

    let latestRoom = await getRoom(room.id);
    if (!latestRoom || latestRoom.status !== "lobby") {
      await removePlayer(room.id, player.id);
      throw new ApiRouteError("ROOM_CLOSED", 409);
    }

    if (latestRoom.owner_player_id === null) {
      try {
        latestRoom = await setRoomOwner(room.id, latestRoom.version, player.id);
      } catch {
        await removePlayer(room.id, player.id);
        throw new ApiRouteError("JOIN_RETRY", 409);
      }
    }
    await addChatMessage(room.id, null, `${player.name} joined the room.`);

    const response = NextResponse.json(
      {
        room: {
          id: latestRoom.id,
          code: latestRoom.code,
          status: latestRoom.status,
          ownerPlayerId: latestRoom.owner_player_id,
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
    return jsonError(error);
  }
}
