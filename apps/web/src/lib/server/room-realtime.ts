import "server-only";

import { z } from "zod";
import { getSupabaseAdminClient } from "./supabase-admin";

const roomChangeSchema = z
  .object({
    type: z.literal("changed"),
    version: z.number().int().nonnegative(),
  })
  .strict();

export async function publishRoomChanged(
  roomId: string,
  version?: number,
): Promise<void> {
  const parsedRoomId = z.string().uuid().parse(roomId);
  let roomVersion = version;

  try {
    const supabase = getSupabaseAdminClient();
    if (roomVersion === undefined) {
      const { data, error } = await supabase
        .from("rooms")
        .select("version")
        .eq("id", parsedRoomId)
        .maybeSingle();
      if (error) throw error;
      if (data === null) return;
      roomVersion = z
        .object({ version: z.number().int().nonnegative() })
        .strict()
        .parse(data).version;
    }

    const payload = roomChangeSchema.parse({
      type: "changed",
      version: roomVersion,
    });
    const channel = supabase.channel(parsedRoomId);

    try {
      const subscription = await new Promise<string>((resolve) => {
        const timeout = globalThis.setTimeout(
          () => resolve("TIMED_OUT"),
          5_000,
        );
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            globalThis.clearTimeout(timeout);
            resolve(status);
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            globalThis.clearTimeout(timeout);
            resolve(status);
          }
        });
      });
      if (subscription !== "SUBSCRIBED") {
        throw new Error(`Realtime subscription ${subscription}.`);
      }

      const result = await channel.send({
        type: "broadcast",
        event: "changed",
        payload,
      });
      if (result !== "ok") {
        throw new Error(`Realtime broadcast ${result}.`);
      }
    } finally {
      await supabase.removeChannel(channel);
    }
  } catch (error) {
    console.error("Could not publish the room change broadcast.", error);
  }
}
