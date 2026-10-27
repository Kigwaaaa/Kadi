import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";

export const metadata: Metadata = {
  title: "Thanks for getting in touch",
  description:
    "Your message has been received. The Kadi team aims to respond within two business days.",
  robots: { index: false, follow: true },
  openGraph: {
    title: "Thanks for getting in touch",
    description:
      "Your message has been received. We aim to reply within two business days.",
    images: [{ url: "/opengraph-image", alt: "Thank you from Kadi" }],
  },
};

export default function ThankYouPage() {
  return (
    <InfoLayout
      currentPage="Thank you"
      eyebrow="Message received"
      title="Thanks for reaching out."
    >
      <p className="text-lg font-semibold">
        Your message is with us. We aim to respond within two business days.
      </p>
      <p>
        While you wait, you can{" "}
        <Link className="font-extrabold text-[#006600] underline" href="/">
          head back to the table
        </Link>{" "}
        or brush up on{" "}
        <Link
          className="font-extrabold text-[#006600] underline"
          href="/how-to-play"
        >
          how to play Kadi
        </Link>
        .
      </p>
    </InfoLayout>
  );
}
