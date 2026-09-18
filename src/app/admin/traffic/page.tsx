import type { Metadata } from "next";
import Link from "next/link";
import { TrafficTable } from "@/components/admin/TrafficTable";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_PATH } from "@/lib/authConstants";
import { getTrafficSummary } from "@/lib/trafficStats";

export const metadata: Metadata = {
  title: "Traffic — jevusecases",
};

export default async function TrafficPage() {
  await requireAdmin();
  const summary = await getTrafficSummary();

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <Link href={ADMIN_PATH} className="font-bp-mono text-[11px] tracking-widest text-bp-accent hover:underline">
            ← ADMIN
          </Link>
          <h1 className="text-3xl font-bold">Traffic</h1>
        </div>
        <TrafficTable summary={summary} />
      </div>
    </main>
  );
}
