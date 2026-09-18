import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ACCOUNT_PATH, TRAFFIC_PATH } from "@/lib/authConstants";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/trafficStats";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "Admin — jevusecases",
};

const SECTIONS = [
  { href: TRAFFIC_PATH, title: "Traffic", description: `Page views by country, last ${TRAFFIC_WINDOW_DAYS} days` },
  { href: ACCOUNT_PATH, title: "Account", description: "Change your password" },
];

export default async function AdminPage() {
  const admin = await requireAdmin();

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <span className="font-bp-mono text-[11px] tracking-widest text-bp-accent">ADMIN</span>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="font-bp-mono text-[13px] text-bp-secondary">{admin.email}</p>
        </div>

        {admin.usingTempPassword && (
          <p role="status" className="text-sm text-bp-secondary">
            You signed in with a temporary password. Changing it is optional; you can do it under Account.
          </p>
        )}

        <nav aria-label="Admin sections">
          <ul className="flex flex-col border-t border-bp-hairline">
            {SECTIONS.map((section) => (
              <li key={section.href} className="border-b border-bp-hairline">
                <Link
                  href={section.href}
                  className="flex items-baseline justify-between gap-4 py-4 transition-colors hover:text-bp-accent"
                >
                  <span className="text-lg font-semibold">{section.title}</span>
                  <span className="text-sm text-bp-secondary">{section.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="border border-bp-ink px-5 py-2.5 text-sm font-semibold text-bp-ink transition-colors hover:border-bp-accent hover:text-bp-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
