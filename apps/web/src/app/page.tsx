import type { Metadata } from "next";
import HomeClient from "@/components/home-client";

export const metadata: Metadata = {
  title: "Play Kadi with your crew",
  description:
    "Create a Kadi room or join your friends for a free online card game for 2 to 6 players.",
  openGraph: {
    title: "Play Kadi with your crew",
    description:
      "Create a Kadi room or join your friends for a free online card game for 2 to 6 players.",
    images: [
      { url: "/opengraph-image", alt: "Kadi — Good cards. Better company." },
    ],
  },
};

export default function HomePage() {
  return <HomeClient />;
}
