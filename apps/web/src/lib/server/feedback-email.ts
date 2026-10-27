import "server-only";

import { z } from "zod";
import type { FeedbackSubmission } from "../feedback";

const emailResponseSchema = z.object({ id: z.string().min(1) }).passthrough();

export class FeedbackEmailError extends Error {
  constructor(
    readonly code:
      "FEEDBACK_EMAIL_CONFIGURATION_MISSING" | "FEEDBACK_EMAIL_DELIVERY_FAILED",
    readonly status?: number,
  ) {
    super(code);
    this.name = "FeedbackEmailError";
  }
}

export async function sendFeedbackEmail(
  submission: FeedbackSubmission,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!apiKey || !from || !to) {
    throw new FeedbackEmailError("FEEDBACK_EMAIL_CONFIGURATION_MISSING");
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: submission.email,
        subject: `Kadi feedback from ${submission.name}`,
        text: [
          `Name: ${submission.name}`,
          `Email: ${submission.email}`,
          "",
          submission.message,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new FeedbackEmailError("FEEDBACK_EMAIL_DELIVERY_FAILED");
  }

  if (!response.ok) {
    throw new FeedbackEmailError(
      "FEEDBACK_EMAIL_DELIVERY_FAILED",
      response.status,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new FeedbackEmailError(
      "FEEDBACK_EMAIL_DELIVERY_FAILED",
      response.status,
    );
  }
  if (!emailResponseSchema.safeParse(result).success) {
    throw new FeedbackEmailError(
      "FEEDBACK_EMAIL_DELIVERY_FAILED",
      response.status,
    );
  }
}
