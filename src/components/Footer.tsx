import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-bp-hairline bg-bp-bg px-6 py-8 font-bp-sans text-bp-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-bp-mono text-[10px] tracking-widest text-bp-secondary">
          JEVUSECASES — WHAT PEOPLE ARE SHIPPING WITH JEV
        </span>
        <div className="flex gap-6 font-bp-mono text-[10px] tracking-widest">
          <Link href="/submit" className="text-bp-secondary hover:text-bp-accent">
            SUBMIT A PROJECT
          </Link>
          <a
            href="https://github.com/theSekyi/jevusecases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bp-secondary hover:text-bp-accent"
          >
            SOURCE
          </a>
        </div>
      </div>
    </footer>
  );
}
