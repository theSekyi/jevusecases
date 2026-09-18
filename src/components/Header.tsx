import Link from "next/link";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-bp-hairline bg-bp-bg px-6 py-3.5 font-bp-sans">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 text-bp-ink">
          <span aria-hidden="true">
            <Logo size={28} />
          </span>
          <span className="text-lg font-semibold tracking-tight">jevusecases</span>
        </Link>
        <Link
          href="/submit"
          className="rounded-md border border-bp-muted px-4 py-2 text-sm font-semibold text-bp-ink transition-colors hover:border-bp-accent hover:text-bp-accent"
        >
          Submit a project
        </Link>
      </div>
    </header>
  );
}
