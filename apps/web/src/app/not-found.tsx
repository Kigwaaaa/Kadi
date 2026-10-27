import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "That page isn’t in the deck. Return to Kadi or read how to play.",
};

export default function NotFound() {
  return (
    <main className="kadi-concrete grid min-h-screen place-items-center px-4 py-10">
      <section className="kadi-poster-panel w-full max-w-xl rounded-3xl bg-[#f8f7f1] p-7 text-center text-black sm:p-10">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-[#006600]">
          Wrong turn
        </p>
        <h1 className="mt-3 text-6xl font-black">404</h1>
        <p className="mt-4 text-lg">
          This page isn’t in the deck. Let’s get you back to the table.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            className="kadi-sticker-button rounded-xl bg-[#bb0000] px-5 py-3 font-black text-white"
            href="/"
          >
            Back home
          </Link>
          <Link
            className="kadi-sticker-button rounded-xl bg-white px-5 py-3 font-black"
            href="/how-to-play"
          >
            How to play
          </Link>
        </div>
      </section>
    </main>
  );
}
