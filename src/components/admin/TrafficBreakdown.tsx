import { countryCodeToFlag, countryName, formatShare, TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import type { TrafficRow, TrafficSummary } from "@/lib/trafficStats";

function labelFor(row: TrafficRow): { flag: string; name: string } {
  if (row.kind === "country") return { flag: countryCodeToFlag(row.country) ?? "🌐", name: countryName(row.country) };
  return row.kind === "unknown" ? { flag: "🌐", name: "Unknown" } : { flag: "…", name: "Other" };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">{label}</span>
      <span className="text-4xl font-bold">{value.toLocaleString("en-US")}</span>
    </div>
  );
}

/** Optional links between the list and the globe: hovering or focusing a country row highlights it there. */
export interface GlobeLinks {
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
  onSelect: (code: string) => void;
}

function RowBody({ row, views }: { row: TrafficRow; views: number }) {
  const { flag, name } = labelFor(row);
  const share = (row.views / views) * 100;

  return (
    <>
      <div className="flex items-baseline gap-3 font-bp-mono text-[13px]">
        <span aria-hidden="true" className="w-6">
          {flag}
        </span>
        <span className="min-w-0 flex-1 text-bp-ink">{name}</span>
        <span className="w-10 text-right text-bp-secondary">{formatShare(row.views, views)}</span>
        <span className="w-20 text-right text-bp-secondary">
          {row.visitors.toLocaleString("en-US")}
          <span className="sr-only"> visitors</span>
        </span>
        <span className="w-14 text-right text-bp-ink">
          {row.views.toLocaleString("en-US")}
          <span className="sr-only"> page views</span>
        </span>
      </div>
      <div aria-hidden="true" className="h-1 bg-bp-hairline/60">
        <div className="h-full bg-bp-ink" style={{ width: `${share}%` }} />
      </div>
    </>
  );
}

const rowClass = "-mx-2 flex w-[calc(100%+1rem)] flex-col gap-1.5 rounded-md px-2 py-1.5 text-left";

export function TrafficBreakdown({ summary, globe }: { summary: TrafficSummary; globe?: GlobeLinks }) {
  const { views, visitors, returning, rows } = summary;

  return (
    <section aria-labelledby="traffic-heading" className="flex flex-col gap-6">
      <h2 id="traffic-heading" className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
        LAST {TRAFFIC_WINDOW_DAYS} DAYS
      </h2>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Stat label="PAGE VIEWS" value={views} />
        <Stat label="UNIQUE VISITORS" value={visitors} />
        <Stat label="RETURNING" value={returning} />
      </div>
      <p className="text-xs text-bp-secondary">
        Visitors are counted by a one-way hash of the IP address; the address itself isn&apos;t stored. Returning means
        seen on two or more different days. Views recorded before visitor counting began, or without an address, count
        as page views but not as visitors.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-bp-secondary">No page views recorded in this window.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div aria-hidden="true" className="flex gap-3 font-bp-mono text-[10px] tracking-widest text-bp-secondary/70">
            <span className="w-6" />
            <span className="flex-1" />
            <span className="w-10" />
            <span className="w-20 text-right">VISITORS</span>
            <span className="w-14 text-right">VIEWS</span>
          </div>
          <ol className="flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.kind === "country" ? row.country : row.kind}>
                {row.kind === "country" && globe ? (
                  <button
                    type="button"
                    onClick={() => globe.onSelect(row.country)}
                    onMouseEnter={() => globe.onHighlight(row.country)}
                    onMouseLeave={() => globe.onHighlight(null)}
                    onFocus={() => globe.onHighlight(row.country)}
                    onBlur={() => globe.onHighlight(null)}
                    className={`${rowClass} transition-colors hover:bg-bp-raised ${globe.highlighted === row.country ? "bg-bp-raised" : ""}`}
                  >
                    <RowBody row={row} views={views} />
                    <span className="sr-only">Show on the globe</span>
                  </button>
                ) : (
                  <div className={rowClass}>
                    <RowBody row={row} views={views} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
