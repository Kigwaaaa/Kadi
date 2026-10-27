import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanupIdleRooms } from "../../../../lib/server/kadi-data";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;

  const parsed = z
    .string()
    .max(512)
    .regex(/^Bearer [\x21-\x7e]+$/)
    .safeParse(authorization);
  if (!parsed.success) return false;

  const supplied = Buffer.from(parsed.data.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await cleanupIdleRooms();
    return NextResponse.json({ deleted: result.deletedRoomIds.length });
  } catch (error) {
    console.error("Room cleanup failed.", error);
    return NextResponse.json({ error: "CLEANUP_FAILED" }, { status: 500 });
  }
}
