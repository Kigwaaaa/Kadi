import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";

export const metadata: Metadata = {
  title: "About Kadi",
  description:
    "Meet the idea behind Kadi, an online table for friends to play together from anywhere.",
  openGraph: {
    title: "About Kadi",
    description: "The story and people behind Kadi, made for playing together.",
    images: [{ url: "/opengraph-image", alt: "About Kadi" }],
  },
};

export default function AboutPage() {
  return (
    <InfoLayout currentPage="About" eyebrow="Why we’re here" title="About Kadi">
      <p className="text-lg font-semibold">
        Kadi brings the familiar fun of a card table to friends who can’t always
        be in the same place.
      </p>
      <p>
        This is a small, community-minded game project. Make a room, invite your
        people, and play together—no account needed.
      </p>
      <p>
        Questions or ideas?{" "}
        <Link
          className="font-extrabold text-[#006600] underline"
          href="/feedback"
        >
          Send feedback.
        </Link>{" "}
        New to the table?{" "}
        <Link
          className="font-extrabold text-[#006600] underline"
          href="/how-to-play"
        >
          Read how to play.
        </Link>
      </p>
    </InfoLayout>
  );
}
