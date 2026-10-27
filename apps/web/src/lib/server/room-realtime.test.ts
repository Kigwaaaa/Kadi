import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  send: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  }),
}));

import { publishRoomChanged } from "./room-realtime";

const roomId = "e9c2aacf-b11d-4c84-99bf-58b8f5a6e341";
const channel = {
  subscribe: mocks.subscribe,
  send: mocks.send,
};

describe("room realtime broadcasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockImplementation((callback: (status: string) => void) => {
      callback("SUBSCRIBED");
      return channel;
    });
    mocks.send.mockResolvedValue("ok");
    mocks.removeChannel.mockResolvedValue("ok");
    mocks.channel.mockReturnValue(channel);
  });

  it("publishes only the changed type and version on the UUID channel", async () => {
    await publishRoomChanged(roomId, 17);

    expect(mocks.channel).toHaveBeenCalledWith(roomId);
    expect(mocks.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "changed",
      payload: { type: "changed", version: 17 },
    });
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
});
