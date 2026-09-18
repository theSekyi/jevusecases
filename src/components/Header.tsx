import Link from "next/link";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="border-b border-bp-hairline bg-bp-bg px-6 py-4 font-bp-sans">
      <div className="mx-auto flex max-w-5xl items-center">
        <Link href="/" className="flex items-center gap-3 text-bp-ink">
          <Logo size={26} />
          <span className="text-lg font-bold tracking-tight">jevusecases</span>
        </Link>
      </div>
    </header>
  );
}
