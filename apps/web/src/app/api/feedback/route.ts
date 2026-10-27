import { NextResponse } from "next/server";
import { createFeedbackRateLimiter } from "../../../lib/feedback-rate-limit";
import { feedbackSubmissionSchema } from "../../../lib/feedback";
import { getSupabaseAdminClient } from "../../../lib/server/supabase-admin";
import {
  FeedbackEmailError,
  sendFeedbackEmail,
} from "../../../lib/server/feedback-email";

const allowSubmission = createFeedbackRateLimiter(5, 60 * 60 * 1000);
const allowedFields = new Set(["name", "email", "message", "website"]);

function redirectWithError(request: Request, code: string, status = 303) {
  const destination = new URL("/feedback", request.url);
  destination.searchParams.set("error", code);
  return NextResponse.redirect(destination, status);
}

function clientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedIp = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwardedIp || "unknown";
}

export async function POST(request: Request) {
  if (!allowSubmission(clientIp(request))) {
    return redirectWithError(request, "RATE_LIMITED");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectWithError(request, "INVALID_INPUT");
  }

  const fields: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (!allowedFields.has(key) || key in fields) {
      return redirectWithError(request, "INVALID_INPUT");
    }
    fields[key] = value;
  }

  const parsed = feedbackSubmissionSchema.safeParse(fields);
  if (!parsed.success || parsed.data.website) {
    return redirectWithError(request, "INVALID_INPUT");
  }

  try {
    await sendFeedbackEmail(parsed.data);
  } catch (error) {
    console.error("Feedback email could not be delivered.", {
      code:
        error instanceof FeedbackEmailError
          ? error.code
          : "FEEDBACK_EMAIL_DELIVERY_FAILED",
      status: error instanceof FeedbackEmailError ? error.status : undefined,
    });
    return redirectWithError(request, "SUBMISSION_FAILED");
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { name, email, message } = parsed.data;
    const { error } = await supabase
      .from("feedback")
      .insert({ name, email, message });

    if (error) {
      console.error("Feedback email was delivered but could not be archived.", {
        code: error.code,
      });
    }
  } catch (error) {
    console.error("Feedback email was delivered but could not be archived.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return NextResponse.redirect(new URL("/thank-you", request.url), 303);
}
