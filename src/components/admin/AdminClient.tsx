"use client";
import { useEffect, useState } from "react";
import { TrafficDashboard } from "./TrafficDashboard";
import type { TrafficSummary } from "@/lib/trafficSummary";
import type { SourcesSummary } from "@/lib/sourceSummary";
import type { LinkClickSummary } from "@/lib/clickSummary";

interface AdminData {
  admin: { email: string };
  summary: TrafficSummary;
  sources: SourcesSummary;
  clicks: LinkClickSummary;
}

export function AdminClient({ section }: { section: "dashboard" | "traffic" | "account" }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Admin access unavailable");
      setData(await response.json());
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  return <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <span className="font-bp-mono text-xs text-bp-accent">ADMIN</span>
      <h1 className="text-3xl font-bold">{section === "dashboard" ? "Dashboard" : section === "traffic" ? "Traffic" : "Account"}</h1>
      <nav aria-label="Admin sections" className="flex gap-5 text-sm underline">
        <a href="/admin">Dashboard</a><a href="/admin/traffic">Traffic</a><a href="/admin/account">Account</a>
        <a href="/cdn-cgi/access/logout">Sign out</a>
      </nav>
      {error ? <p role="alert">Admin access is unavailable. <a className="underline" href="/cdn-cgi/access/logout">Sign in again</a>.</p>
        : !data ? <p role="status">Loading…</p> : <>
          <p className="font-bp-mono text-sm">{data.admin.email}</p>
          {section === "traffic" ? <TrafficDashboard summary={data.summary} sources={data.sources} clicks={data.clicks} />
            : section === "account" ? <p>You sign in with an email code. No website password is required.</p>
              : <p>Review visits, sources, and link clicks under Traffic.</p>}
        </>}
    </div>
  </main>;
}
