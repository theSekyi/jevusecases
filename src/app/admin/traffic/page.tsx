import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TrafficBreakdown } from "@/components/admin/TrafficBreakdown";
import { requireAdmin } from "@/lib/auth";
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
        <AdminPageHeader title="Traffic" />
        <TrafficBreakdown summary={summary} />
      </div>
    </main>
  );
}
