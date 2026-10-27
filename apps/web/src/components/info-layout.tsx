import Link from "next/link";

const infoLinks = [
  { href: "/how-to-play", label: "How to play" },
  { href: "/about", label: "About" },
  { href: "/feedback", label: "Feedback" },
  { href: "/privacy", label: "Privacy" },
];

export function InfoLayout({
  title,
  eyebrow,
  currentPage,
  children,
}: {
  title: string;
  eyebrow: string;
  currentPage: string;
  children: React.ReactNode;
}) {
  return (
    <main className="kadi-concrete min-h-screen px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <Link className="text-2xl font-black tracking-tight" href="/">
            KADI<span className="text-[#bb0000]">.</span>
          </Link>
          <Link
            className="kadi-sticker-button rounded-xl bg-[#006600] px-4 py-2 text-sm text-white"
            href="/"
          >
            Play now
          </Link>
        </header>

        <nav aria-label="Breadcrumb" className="mt-6 text-sm text-white/75">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link className="underline underline-offset-4" href="/">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-bold text-white">
              {currentPage}
            </li>
          </ol>
        </nav>

        <article className="kadi-poster-panel mt-5 rounded-3xl bg-[#f8f7f1] p-5 text-black sm:p-9">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#006600]">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">
            {title}
          </h1>
          <div className="mt-7 space-y-6 leading-7 text-[#242624]">
            {children}
          </div>
        </article>

        <footer className="py-8 text-sm text-white/85">
          <nav
            aria-label="Site information"
            className="flex flex-wrap justify-center gap-x-5 gap-y-3"
          >
            {infoLinks.map((item) => (
              <Link
                className="underline underline-offset-4 hover:text-white"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="mt-3 text-center text-xs">
            Kadi, made for playing together.
          </p>
        </footer>
      </div>
    </main>
  );
}
