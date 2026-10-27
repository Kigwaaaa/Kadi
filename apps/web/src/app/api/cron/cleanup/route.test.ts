import { beforeEach, describe, expect, it, vi } from "vitest";

const { cleanupIdleRooms } = vi.hoisted(() => ({
  cleanupIdleRooms: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/server/kadi-data", () => ({ cleanupIdleRooms }));

import { GET } from "./route";

describe("Vercel room cleanup cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    cleanupIdleRooms.mockResolvedValue({ deletedRoomIds: ["room-id"] });
  });

  it("rejects requests without the cron bearer secret", async () => {
    const response = await GET(
      new Request("https://kadi.example/api/cron/cleanup"),
    );

    expect(response.status).toBe(401);
    expect(cleanupIdleRooms).not.toHaveBeenCalled();
  });

  it("runs cleanup only for an authenticated cron request", async () => {
    const response = await GET(
      new Request("https://kadi.example/api/cron/cleanup", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 1 });
    expect(cleanupIdleRooms).toHaveBeenCalledOnce();
  });

  it("returns a generic error if cleanup fails", async () => {
    cleanupIdleRooms.mockRejectedValueOnce(
      new Error("internal database detail"),
    );
    const response = await GET(
      new Request("https://kadi.example/api/cron/cleanup", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "CLEANUP_FAILED" });
    expect(JSON.stringify(body)).not.toContain("internal database detail");
  });
});
