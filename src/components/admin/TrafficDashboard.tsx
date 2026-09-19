"use client";

import { useState } from "react";
import type { SourcesSummary } from "@/lib/trafficSources";
import type { TrafficSummary } from "@/lib/trafficStats";
import { TrafficBreakdown } from "./TrafficBreakdown";
import { TrafficGlobe, type GlobeFocus } from "./TrafficGlobe";
import { TrafficSources } from "./TrafficSources";

/** The globe and the list side by side, linked: hover a row to light up its country, click one to turn the globe to it. */
export function TrafficDashboard({ summary, sources }: { summary: TrafficSummary; sources: SourcesSummary }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [focus, setFocus] = useState<GlobeFocus | null>(null);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-start lg:gap-16">
      <div className="lg:sticky lg:top-24">
        <TrafficGlobe rows={summary.rows} highlighted={highlighted} onHighlight={setHighlighted} focus={focus} />
      </div>
      <div className="flex flex-col gap-14">
        <TrafficBreakdown
          summary={summary}
          globe={{
            highlighted,
            onHighlight: setHighlighted,
            onSelect: (code) => setFocus({ code }),
          }}
        />
        <TrafficSources summary={sources} />
      </div>
    </div>
  );
}
