import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { GoogleAnalytics } from "@/components/google-analytics";
import "./globals.css";

const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800", "900"],
  display: "swap",
});
const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Play Kadi with your crew",
    template: "%s | Kadi",
  },
  description:
    "Create a Kadi room or join your friends for a free online card game for 2 to 6 players.",
  openGraph: {
    type: "website",
    siteName: "Kadi",
    title: "Play Kadi with your crew",
    description:
      "Create a Kadi room or join your friends for a free online card game for 2 to 6 players.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Kadi — Good cards. Better company.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Play Kadi with your crew",
    description:
      "Create a Kadi room or join your friends for a free online card game for 2 to 6 players.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${displayFont.variable} ${bodyFont.variable}`} lang="en">
      <body>
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
