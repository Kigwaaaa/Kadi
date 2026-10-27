import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "Learn what Kadi stores for multiplayer play, feedback and production analytics, and how to contact us.",
  openGraph: {
    title: "Kadi privacy policy",
    description:
      "A plain-language overview of how Kadi handles game, feedback and analytics data.",
    images: [{ url: "/opengraph-image", alt: "Kadi privacy policy" }],
  },
};

export default function PrivacyPage() {
  return (
    <InfoLayout
      currentPage="Privacy"
      eyebrow="The short version"
      title="Privacy policy"
    >
      <p className="text-sm font-semibold text-[#555b55]">
        Last updated: 26 October 2026
      </p>
      <p className="text-lg font-semibold">
        Kadi is designed to let friends play without creating accounts. We
        collect only what is needed to run the game and respond to messages.
      </p>

      <section aria-labelledby="game-data-heading">
        <h2 className="text-2xl font-black" id="game-data-heading">
          Game and room data
        </h2>
        <p>
          Room codes, player names and authoritative game state are stored in
          the Kadi database while a room is active. Chat messages are stored
          with the room and deleted when the game ends or the room closes.
          Finished rooms and rooms idle for 24 hours are removed by scheduled
          cleanup. A random guest token is stored in a secure, HTTP-only browser
          cookie so a player can reconnect to their seat; only a hash of the
          token is stored with the player record. We do not use browser local
          storage for guest identity.
        </p>
      </section>

      <section aria-labelledby="feedback-data-heading">
        <h2 className="text-2xl font-black" id="feedback-data-heading">
          Feedback and enquiries
        </h2>
        <p>
          If you contact us, we store the name, email address and message you
          submit in a restricted feedback database so we can review and answer
          it. Please do not include passwords, payment details or other
          sensitive information. We retain messages only as long as needed to
          handle the enquiry and maintain appropriate records.
        </p>
        <p>
          We aim to respond within two business days. Use the{" "}
          <Link className="font-extrabold underline" href="/feedback">
            feedback form
          </Link>{" "}
          for questions or requests about your submission.
        </p>
      </section>

      <section aria-labelledby="analytics-heading">
        <h2 className="text-2xl font-black" id="analytics-heading">
          Google Analytics
        </h2>
        <p>
          Google Analytics is loaded only on production builds and only when a
          measurement ID is configured. It may use cookies and collect usage
          information such as pages visited and general device/browser details.
          It is not loaded in local development. You can also control cookies
          through your browser settings.
        </p>
      </section>

      <section aria-labelledby="sharing-heading">
        <h2 className="text-2xl font-black" id="sharing-heading">
          Sharing, security and changes
        </h2>
        <p>
          We do not sell personal information. The feedback database provider
          processes submitted enquiries for us. We use reasonable safeguards,
          but no internet service can promise perfect security. We may update
          this policy when the service changes; the date above will be updated
          when we do.
        </p>
      </section>

      <p>
        For more about the project, visit{" "}
        <Link className="font-extrabold text-[#006600] underline" href="/about">
          About Kadi
        </Link>{" "}
        or{" "}
        <Link
          className="font-extrabold text-[#006600] underline"
          href="/how-to-play"
        >
          read the rules
        </Link>
        .
      </p>
    </InfoLayout>
  );
}
