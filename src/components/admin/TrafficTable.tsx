import { TRAFFIC_WINDOW_DAYS, type TrafficRow, type TrafficSummary } from "@/lib/trafficStats";
import { countryCodeToFlag, countryName } from "@/lib/visitorEvents";

function describe(row: TrafficRow): { flag: string; name: string } {
  if (row.kind === "country") return { flag: countryCodeToFlag(row.country) ?? "🌐", name: countryName(row.country) };
  return row.kind === "unknown" ? { flag: "🌐", name: "Unknown" } : { flag: "…", name: "Other" };
}

export function TrafficTable({ summary }: { summary: TrafficSummary }) {
  const { total, rows } = summary;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
          VISITS, LAST {TRAFFIC_WINDOW_DAYS} DAYS
        </span>
        <span className="text-5xl font-bold">{total.toLocaleString("en-US")}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-bp-secondary">No visits recorded in this window.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) => {
            const { flag, name } = describe(row);
            const share = (row.visits / total) * 100;
            return (
              <li key={row.kind === "country" ? row.country : row.kind} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-3 font-bp-mono text-[13px]">
                  <span aria-hidden="true" className="w-6">
                    {flag}
                  </span>
                  <span className="flex-1 text-bp-ink">{name}</span>
                  <span className="text-bp-secondary">{share.toFixed(share < 10 ? 1 : 0)}%</span>
                  <span className="w-12 text-right text-bp-ink">{row.visits.toLocaleString("en-US")}</span>
                </div>
                <div className="h-1 bg-bp-hairline/60">
                  <div className="h-full bg-bp-ink" style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
