import { formatShare, TRAFFIC_WINDOW_DAYS } from "@/lib/trafficStats";
import type { SourceRow, SourcesSummary } from "@/lib/trafficSources";

const HINTS: Partial<Record<SourceRow["kind"], string>> = {
  direct: "Typed address, bookmark, or an app that doesn't say where a link came from, such as some email and chat apps",
};

function SourceItem({ row, total }: { row: SourceRow; total: number }) {
  const share = (row.landings / total) * 100;
  const hint = HINTS[row.kind];

  return (
    <li className="flex flex-col gap-1.5 py-1.5">
      <div className="flex items-baseline gap-3 font-bp-mono text-[13px]">
        <span className="min-w-0 flex-1 text-bp-ink [overflow-wrap:anywhere]">
          {row.kind === "tag" && (
            <span className="mr-2 rounded border border-bp-muted px-1.5 py-0.5 text-[10px] tracking-widest text-bp-secondary">TAG</span>
          )}
          {row.label}
          {row.kind === "tag" && row.via && <span className="text-bp-secondary"> via {row.via}</span>}
        </span>
        <span className="w-10 text-right text-bp-secondary">{formatShare(row.landings, total)}</span>
        <span className="w-14 text-right text-bp-ink">
          {row.landings.toLocaleString("en-US")}
          <span className="sr-only"> landings</span>
        </span>
      </div>
      {hint && <p className="text-xs text-bp-secondary">{hint}</p>}
      <div aria-hidden="true" className="h-1 bg-bp-hairline/60">
        <div className="h-full bg-bp-ink" style={{ width: `${share}%` }} />
      </div>
    </li>
  );
}

export function TrafficSources({ summary }: { summary: SourcesSummary }) {
  const { landings, rows } = summary;

  return (
    <section aria-labelledby="sources-heading" className="flex flex-col gap-4">
      <h2 id="sources-heading" className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
        WHERE VISITORS LAND FROM, LAST {TRAFFIC_WINDOW_DAYS} DAYS
      </h2>
      <p className="text-xs text-bp-secondary">
        Counts the first page of a visit, not clicks around the site. A site is named by its hostname only, never the
        full address it linked from. Add <code className="font-bp-mono text-bp-ink">?ref=name</code> to a link you share
        to see it under its own name.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-bp-secondary">No arrivals recorded in this window yet.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between font-bp-mono text-[10px] tracking-widest text-bp-secondary/70">
            <span aria-hidden="true">SOURCE</span>
            <span aria-hidden="true">LANDINGS ({landings.toLocaleString("en-US")})</span>
          </div>
          <ol className="flex flex-col">
            {rows.map((row) => (
              <SourceItem key={`${row.kind}-${row.label}`} row={row} total={landings} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
