import { NextResponse } from "next/server";
import { createFeedbackRateLimiter } from "../../../lib/feedback-rate-limit";
import { feedbackSubmissionSchema } from "../../../lib/feedback";
import { getSupabaseAdminClient } from "../../../lib/server/supabase-admin";

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
    const supabase = getSupabaseAdminClient();
    const { name, email, message } = parsed.data;
    const { error } = await supabase
      .from("feedback")
      .insert({ name, email, message });

    if (error) {
      console.error("Feedback submission could not be stored.");
      return redirectWithError(request, "SUBMISSION_FAILED");
    }
  } catch (error) {
    console.error("Feedback submission could not be stored.", error);
    return redirectWithError(request, "SUBMISSION_FAILED");
  }

  return NextResponse.redirect(new URL("/thank-you", request.url), 303);
}
