import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TrafficDashboard } from "@/components/admin/TrafficDashboard";
import { requireAdmin } from "@/lib/auth";
import { getLinkClickSummary } from "@/lib/linkClicks";
import { getProjects } from "@/lib/projects";
import { getTrafficSources } from "@/lib/trafficSources";
import { getTrafficSummary } from "@/lib/trafficStats";

export const metadata: Metadata = {
  title: "Traffic — jevusecases",
};

export default async function TrafficPage() {
  await requireAdmin();
  const names = new Map(getProjects().map((project) => [project.id, project.project]));
  const [summary, sources, clicks] = await Promise.all([
    getTrafficSummary(),
    getTrafficSources(),
    getLinkClickSummary((id) => names.get(id) ?? null),
  ]);

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-6xl flex-col gap-10">
        <AdminPageHeader title="Traffic" />
        <TrafficDashboard summary={summary} sources={sources} clicks={clicks} />
      </div>
    </main>
  );
}
