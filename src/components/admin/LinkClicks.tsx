import { MIN_LINK_CLICKERS } from "@/lib/linkKinds";
import type { LinkClickSummary } from "@/lib/linkClicks";
import { formatShare, TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";

function ListHeading({ children, right }: { children: string; right: string }) {
  return (
    <div className="flex items-baseline justify-between font-bp-mono text-[10px] tracking-widest text-bp-secondary/70">
      <span aria-hidden="true">{children}</span>
      <span aria-hidden="true">{right}</span>
    </div>
  );
}

export function LinkClicks({ summary }: { summary: LinkClickSummary }) {
  const { clicks, clickers, kinds, projects, hosts } = summary;

  return (
    <section aria-labelledby="clicks-heading" className="flex flex-col gap-4">
      <h2 id="clicks-heading" className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
        WHAT VISITORS CLICK, LAST {TRAFFIC_WINDOW_DAYS} DAYS
      </h2>
      <p className="text-xs text-bp-secondary">
        Each number is people, not clicks: a visitor who clicks the same kind of link twice is one. A row with fewer than{" "}
        {MIN_LINK_CLICKERS} people appears only under &ldquo;Other&rdquo;, and projects and sites below that are left out.
      </p>

      {clicks === 0 ? (
        <p className="text-sm text-bp-secondary">No clicks recorded in this window yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <ListHeading right={`PEOPLE (${clickers.toLocaleString("en-US")})`}>WHAT THEY CLICKED</ListHeading>
            <ol className="flex flex-col gap-1 font-bp-mono text-[13px]">
              {kinds.map((row) => (
                <li key={row.kind} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 text-bp-ink">{row.label}</span>
                  <span className="w-10 text-right text-bp-secondary">{formatShare(row.clickers, clickers)}</span>
                  <span className="w-14 text-right text-bp-ink">
                    {row.clickers.toLocaleString("en-US")}
                    <span className="sr-only"> people</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {projects.length > 0 && (
            <div className="flex flex-col gap-2">
              <ListHeading right="OPENED · FOLLOWED A LINK">MOST OPENED PROJECTS</ListHeading>
              <ol className="flex flex-col gap-1 font-bp-mono text-[13px]">
                {projects.map((row) => (
                  <li key={row.id} className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-bp-ink [overflow-wrap:anywhere]">{row.name}</span>
                    <span className="w-8 text-right text-bp-ink">
                      {row.opened.toLocaleString("en-US")}
                      <span className="sr-only"> people opened it</span>
                    </span>
                    <span className="w-16 text-right text-bp-secondary">
                      {row.followed.toLocaleString("en-US")} · {row.followed === 0 ? "0%" : formatShare(row.followed, row.opened)}
                      <span className="sr-only"> people followed one of its links</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {hosts.length > 0 && (
            <div className="flex flex-col gap-2">
              <ListHeading right="PEOPLE">WHERE THEY WENT</ListHeading>
              <ol className="flex flex-col gap-1 font-bp-mono text-[13px]">
                {hosts.map((row) => (
                  <li key={row.host} className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-bp-ink [overflow-wrap:anywhere]">{row.host}</span>
                    <span className="w-14 text-right text-bp-ink">
                      {row.clickers.toLocaleString("en-US")}
                      <span className="sr-only"> people</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
