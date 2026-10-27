import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";

export const metadata: Metadata = {
  title: "Contact and feedback",
  description:
    "Send the Kadi team a question, suggestion or enquiry. We aim to reply within two business days.",
  openGraph: {
    title: "Contact and feedback",
    description:
      "Get in touch with Kadi. We aim to reply within two business days.",
    images: [{ url: "/opengraph-image", alt: "Contact the Kadi team" }],
  },
};

const errors: Record<string, string> = {
  INVALID_INPUT: "Check the fields and try again.",
  RATE_LIMITED: "Too many messages were sent. Please try again in an hour.",
  SUBMISSION_FAILED:
    "We couldn’t send your message right now. Please try again later.",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <InfoLayout
      currentPage="Feedback"
      eyebrow="We’re listening"
      title="Send us a note"
    >
      <p className="text-lg font-semibold">
        Questions, ideas or something not working? Tell us what’s up. We aim to
        reply within two business days.
      </p>
      {error && errors[error] && (
        <p
          className="rounded-xl border-2 border-[#bb0000] bg-white p-4 font-bold text-[#8d0000]"
          role="alert"
        >
          {errors[error]}
        </p>
      )}
      <form
        action="/api/feedback"
        className="grid gap-4 rounded-2xl border-2 border-black bg-white p-5 shadow-[6px_6px_0_#bb0000] sm:p-7"
        method="post"
      >
        <label className="grid gap-1.5 font-bold" htmlFor="feedback-name">
          Your name
          <input
            autoComplete="name"
            className="min-h-12 rounded-xl border-2 border-[#b8b8b0] px-3 font-medium focus:border-[#006600] focus:outline-2 focus:outline-[#006600]"
            id="feedback-name"
            maxLength={50}
            minLength={2}
            name="name"
            required
          />
        </label>
        <label className="grid gap-1.5 font-bold" htmlFor="feedback-email">
          Email address
          <input
            autoComplete="email"
            className="min-h-12 rounded-xl border-2 border-[#b8b8b0] px-3 font-medium focus:border-[#006600] focus:outline-2 focus:outline-[#006600]"
            id="feedback-email"
            maxLength={254}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="grid gap-1.5 font-bold" htmlFor="feedback-message">
          Your message
          <textarea
            className="min-h-36 rounded-xl border-2 border-[#b8b8b0] px-3 py-2 font-medium focus:border-[#006600] focus:outline-2 focus:outline-[#006600]"
            id="feedback-message"
            maxLength={1000}
            minLength={10}
            name="message"
            required
            rows={5}
          />
        </label>
        <div
          aria-hidden="true"
          className="absolute -left-[10000px] h-px w-px overflow-hidden"
        >
          <label htmlFor="feedback-website">Leave this field empty</label>
          <input
            autoComplete="off"
            id="feedback-website"
            name="website"
            tabIndex={-1}
            type="text"
          />
        </div>
        <p className="text-sm text-[#454a45]">
          We use your contact details only to respond to your message. See our{" "}
          <Link className="font-bold underline" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
        <button
          className="kadi-sticker-button min-h-14 rounded-xl bg-[#006600] px-5 font-black text-white"
          type="submit"
        >
          Send feedback
        </button>
      </form>
    </InfoLayout>
  );
}
