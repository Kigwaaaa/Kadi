import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { jsonError } from "./api-routes";

describe("API error responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports missing Supabase server credentials as unavailable", async () => {
    const response = jsonError(new Error("SUPABASE_CONFIGURATION_MISSING"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "SERVICE_UNAVAILABLE",
    });
  });

  it("keeps internal failures generic to clients and logs diagnostic details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = jsonError(new Error("Supabase request failed (42P01)."));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "REQUEST_FAILED" });
    expect(log).toHaveBeenCalledWith("API request failed.", {
      name: "Error",
      message: "Supabase request failed (42P01).",
    });
  });
});
