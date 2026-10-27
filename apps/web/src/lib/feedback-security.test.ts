import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFeedbackRateLimiter } from "./feedback-rate-limit";
import { feedbackSubmissionSchema } from "./feedback";

vi.mock("server-only", () => ({}));

const { insert } = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({ insert }),
  })),
}));

import { POST } from "../app/api/feedback/route";

describe("feedback submission security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-role-key";
    process.env.RESEND_API_KEY = "test-only-resend-key";
    process.env.FEEDBACK_FROM_EMAIL = "Kadi <feedback@example.com>";
    process.env.FEEDBACK_TO_EMAIL = "kigwalewis@gmail.com";
    insert.mockResolvedValue({ error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "email_test123" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates, strips controls and rejects unknown input fields", () => {
    expect(
      feedbackSubmissionSchema.safeParse({
        name: "  Ka\u0000di  ",
        email: "kadi@example.com",
        message: "  Please add a feature.  ",
        website: "",
      }),
    ).toMatchObject({
      success: true,
      data: {
        name: "Kadi",
        message: "Please add a feature.",
      },
    });

    expect(
      feedbackSubmissionSchema.safeParse({
        name: "Kadi",
        email: "kadi@example.com",
        message: "Please add a feature.",
        unexpected: "not allowed",
      }).success,
    ).toBe(false);
    expect(
      feedbackSubmissionSchema.safeParse({
        name: "K",
        email: "not-an-email",
        message: "short",
      }).success,
    ).toBe(false);
  });

  it("limits each IP to five submissions per hour and resets after expiry", () => {
    const allow = createFeedbackRateLimiter(5, 60 * 60 * 1000);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(allow("192.0.2.1", 1_000)).toBe(true);
    }
    expect(allow("192.0.2.1", 1_000)).toBe(false);
    expect(allow("192.0.2.2", 1_000)).toBe(true);
    expect(allow("192.0.2.1", 3_601_001)).toBe(true);
  });

  it("emails valid messages and archives them before redirecting", async () => {
    const response = await POST(
      new Request("https://kadi.example/api/feedback", {
        method: "POST",
        headers: { "x-real-ip": "192.0.2.10" },
        body: new URLSearchParams({
          name: "Kadi Player",
          email: "player@example.com",
          message: "I would love to see another card design.",
          website: "",
        }),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://kadi.example/thank-you",
    );
    expect(insert).toHaveBeenCalledWith({
      name: "Kadi Player",
      email: "player@example.com",
      message: "I would love to see another card design.",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-only-resend-key",
        }),
        body: JSON.stringify({
          from: "Kadi <feedback@example.com>",
          to: ["kigwalewis@gmail.com"],
          reply_to: "player@example.com",
          subject: "Kadi feedback from Kadi Player",
          text: [
            "Name: Kadi Player",
            "Email: player@example.com",
            "",
            "I would love to see another card design.",
          ].join("\n"),
        }),
      }),
    );
  });

  it("rejects honeypot and unknown form fields without storing them", async () => {
    const response = await POST(
      new Request("https://kadi.example/api/feedback", {
        method: "POST",
        headers: { "x-real-ip": "192.0.2.11" },
        body: new URLSearchParams({
          name: "Kadi Player",
          email: "player@example.com",
          message: "This message should not be saved.",
          website: "spam",
        }),
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://kadi.example/feedback?error=INVALID_INPUT",
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rate limits form submissions by client IP", async () => {
    const makeRequest = () =>
      new Request("https://kadi.example/api/feedback", {
        method: "POST",
        headers: { "x-real-ip": "192.0.2.13" },
        body: new URLSearchParams({
          name: "Kadi Player",
          email: "player@example.com",
          message: "This message should be counted for the rate limit.",
          website: "",
        }),
      });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(makeRequest());
      expect(response.headers.get("location")).toBe(
        "https://kadi.example/thank-you",
      );
    }

    const limited = await POST(makeRequest());
    expect(limited.headers.get("location")).toBe(
      "https://kadi.example/feedback?error=RATE_LIMITED",
    );
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it("still confirms delivered feedback if database archiving fails", async () => {
    insert.mockResolvedValueOnce({
      error: new Error("private database detail"),
    });
    const response = await POST(
      new Request("https://kadi.example/api/feedback", {
        method: "POST",
        headers: { "x-real-ip": "192.0.2.12" },
        body: new URLSearchParams({
          name: "Kadi Player",
          email: "player@example.com",
          message: "This message should not be saved.",
          website: "",
        }),
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://kadi.example/thank-you",
    );
    expect(await response.text()).not.toContain("private database detail");
  });

  it("does not claim success when email delivery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(
      new Request("https://kadi.example/api/feedback", {
        method: "POST",
        headers: { "x-real-ip": "192.0.2.14" },
        body: new URLSearchParams({
          name: "Kadi Player",
          email: "player@example.com",
          message: "Please let me know when my message arrives.",
          website: "",
        }),
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://kadi.example/feedback?error=SUBMISSION_FAILED",
    );
    expect(insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Feedback email could not be delivered.",
      expect.objectContaining({
        code: "FEEDBACK_EMAIL_DELIVERY_FAILED",
        status: 401,
      }),
    );
  });

  it("requires the email delivery configuration", async () => {
    delete process.env.RESEND_API_KEY;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(
      new Request("https://kadi.example/api/feedback", {
        method: "POST",
        headers: { "x-real-ip": "192.0.2.15" },
        body: new URLSearchParams({
          name: "Kadi Player",
          email: "player@example.com",
          message: "Please let me know when my message arrives.",
          website: "",
        }),
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://kadi.example/feedback?error=SUBMISSION_FAILED",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Feedback email could not be delivered.",
      expect.objectContaining({
        code: "FEEDBACK_EMAIL_CONFIGURATION_MISSING",
      }),
    );
  });
});
