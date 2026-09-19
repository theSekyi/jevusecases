import { formatShare, TRAFFIC_WINDOW_DAYS } from "@/lib/trafficStats";
import { MIN_SOURCE_VISITORS } from "@/lib/sourceRules";
import type { SourceRow, SourcesSummary } from "@/lib/trafficSources";

function SourceItem({ row, total }: { row: SourceRow; total: number }) {
  const share = (row.visitors / total) * 100;

  return (
    <li className="flex flex-col gap-1.5 py-1.5">
      <div className="flex items-baseline gap-3 font-bp-mono text-[13px]">
        <span className="min-w-0 flex-1 text-bp-ink [overflow-wrap:anywhere]">
          {row.kind === "tag" && (
            <>
              <span className="rounded border border-bp-muted px-1.5 py-0.5 text-[10px] tracking-widest text-bp-secondary">TAG</span>{" "}
            </>
          )}
          {row.label}
          {row.kind === "tag" && row.via && <span className="text-bp-secondary"> via {row.via}</span>}
        </span>
        <span className="w-10 text-right text-bp-secondary">{formatShare(row.visitors, total)}</span>
        <span className="w-14 text-right text-bp-ink">
          {row.visitors.toLocaleString("en-US")}
          <span className="sr-only"> visitors</span>
        </span>
      </div>
      {row.kind === "direct" && (
        <p className="text-xs text-bp-secondary">
          Typed address, bookmark, or an app that doesn&apos;t say where a link came from, such as some email and chat apps
        </p>
      )}
      <div aria-hidden="true" className="h-1 bg-bp-hairline/60">
        <div className="h-full bg-bp-ink" style={{ width: `${share}%` }} />
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

export function TrafficSources({ summary }: { summary: SourcesSummary }) {
  const { visitors, rows, partialSince, collecting } = summary;

  return (
    <section aria-labelledby="sources-heading" className="flex flex-col gap-4">
      <h2 id="sources-heading" className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
        WHERE VISITORS LAND FROM, LAST {TRAFFIC_WINDOW_DAYS} DAYS
      </h2>
      <p className="text-xs text-bp-secondary">
        Each visitor is counted once per source, by how they arrived; clicks around the site don&apos;t count. A site is
        named by its hostname only, never the full address it linked from. To name a link you share, add{" "}
        <code className="font-bp-mono text-bp-ink">?ref=name</code> to it: letters, numbers, - and _, up to 40. A source
        or tag with fewer than {MIN_SOURCE_VISITORS} visitors appears only under &ldquo;Other&rdquo;.
      </p>
      {partialSince && (
        <p role="note" className="text-xs text-bp-secondary">
          Counted from {formatDate(partialSince)}, when arrivals started being told apart from clicks around the site.
          Earlier visits aren&apos;t included, so this fills in over the week.
        </p>
      )}

      {collecting ? (
        <p className="text-sm text-bp-secondary">Arrivals are being recorded now. Sources will appear as visitors arrive.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-bp-secondary">No arrivals recorded in this window yet.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between font-bp-mono text-[10px] tracking-widest text-bp-secondary/70">
            <span aria-hidden="true">SOURCE</span>
            <span aria-hidden="true">VISITORS ({visitors.toLocaleString("en-US")})</span>
          </div>
          <ol className="flex flex-col">
            {rows.map((row) => (
              <SourceItem key={`${row.kind}-${row.label}`} row={row} total={visitors} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
