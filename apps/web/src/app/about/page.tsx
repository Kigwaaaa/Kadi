import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
      <section aria-labelledby="creator-heading">
        <h2 className="text-2xl font-black" id="creator-heading">
          The person behind the cards
        </h2>
        <figure className="mt-4 grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-center">
          <Image
            alt="Placeholder portrait illustration. Replace with a real photo of the Kadi creator before launch."
            className="h-48 w-48 rounded-2xl border-4 border-black object-cover shadow-[6px_6px_0_#bb0000]"
            height={256}
            src="/creator-photo-placeholder.svg"
            width={256}
          />
          <figcaption className="rounded-2xl bg-[#e8eee3] p-4">
            <strong className="block text-lg">
              Creator portrait placeholder
            </strong>
            <span>
              Replace this illustration with a real photo of the creator and add
              their name and story before launch.
            </span>
          </figcaption>
        </figure>
      </section>
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
