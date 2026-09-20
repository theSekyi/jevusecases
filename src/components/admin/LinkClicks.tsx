import { MIN_LINK_CLICKERS } from "@/lib/linkKinds";
import type { LinkClickSummary } from "@/lib/linkClicks";
import { formatShare, TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";

const numberClass = "text-right tabular-nums";

/** A list's title is a real heading, so a screen reader can name each list; the column labels beside it are for sighted readers only. */
function ListHeader({ id, title, columns }: { id: string; title: string; columns: { label: string; className?: string }[] }) {
  return (
    <div className="flex items-baseline gap-3 font-bp-mono text-[10px] tracking-widest text-bp-secondary/70">
      <h3 id={id} className="min-w-0 flex-1 font-normal">
        {title}
      </h3>
      {columns.map((column) => (
        <span key={column.label} aria-hidden="true" className={`w-16 text-right ${column.className ?? ""}`}>
          {column.label}
        </span>
      ))}
    </div>
  );
}

export function LinkClicks({ summary }: { summary: LinkClickSummary }) {
  const { clicks, clickers, tooFew, kinds, projects, hosts } = summary;

  return (
    <section aria-labelledby="clicks-heading" className="flex flex-col gap-4">
      <h2 id="clicks-heading" className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
        WHAT VISITORS CLICK, LAST {TRAFFIC_WINDOW_DAYS} DAYS
      </h2>
      <p className="text-xs text-bp-secondary">
        The main number is people: a visitor who presses the same thing twice is one person. Clicks in the last few
        seconds of a repeat are dropped. Anything that fewer than {MIN_LINK_CLICKERS} people did is left out, and
        the small ones together are shown as &ldquo;Other&rdquo; once they add up to {MIN_LINK_CLICKERS} people. Opening
        a project from a shared link, rather than a card, isn&apos;t counted as opening it.
      </p>

      {tooFew ? (
        <p className="text-sm text-bp-secondary">
          Fewer than {MIN_LINK_CLICKERS} people have clicked so far, so nothing is shown yet.
        </p>
      ) : clicks === 0 ? (
        <p className="text-sm text-bp-secondary">No clicks recorded in this window yet.</p>
      ) : (
        <>
          <p className="font-bp-mono text-[13px] text-bp-ink">
            {clickers.toLocaleString("en-US")} people clicked something, {clicks.toLocaleString("en-US")} clicks in all
          </p>
          <div className="flex flex-col gap-2">
            <ListHeader id="clicks-kinds" title="WHAT THEY DID" columns={[{ label: "SHARE", className: "hidden sm:block" }, { label: "PEOPLE" }, { label: "CLICKS" }]} />
            <ol role="list" aria-labelledby="clicks-kinds" className="flex flex-col gap-1 font-bp-mono text-[13px]">
              {kinds.map((row) => (
                <li key={row.kind} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 text-bp-ink">{row.label}</span>
                  <span className={`hidden w-16 text-bp-secondary sm:block ${numberClass}`}>{formatShare(row.clickers, clickers)}</span>
                  <span className={`w-16 text-bp-ink ${numberClass}`}>
                    {row.clickers.toLocaleString("en-US")}
                    <span className="sr-only"> people</span>
                  </span>
                  <span className={`w-16 text-bp-secondary ${numberClass}`}>
                    {row.clicks.toLocaleString("en-US")}
                    <span className="sr-only"> clicks</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {projects.length > 0 && (
            <div className="flex flex-col gap-2">
              <ListHeader id="clicks-projects" title="MOST OPENED PROJECTS" columns={[{ label: "OPENED" }, { label: "FOLLOWED" }]} />
              <ol role="list" aria-labelledby="clicks-projects" className="flex flex-col gap-1 font-bp-mono text-[13px]">
                {projects.map((row) => (
                  <li key={row.id ?? "other"} className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-bp-ink [overflow-wrap:anywhere]">{row.name}</span>
                    <span className={`w-16 text-bp-ink ${numberClass}`}>
                      {row.opened.toLocaleString("en-US")}
                      <span className="sr-only"> people opened it</span>
                    </span>
                    <span className={`w-16 text-bp-secondary ${numberClass}`}>
                      {row.followed === null ? (
                        <>
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">Fewer than {MIN_LINK_CLICKERS} people followed one of its links</span>
                        </>
                      ) : (
                        <>
                          {formatShare(row.followed, row.opened)}
                          <span className="sr-only">
                            {" "}
                            ({row.followed.toLocaleString("en-US")} people followed one of its source, announcement or author links)
                          </span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {hosts.length > 0 && (
            <div className="flex flex-col gap-2">
              <ListHeader id="clicks-hosts" title="WHERE THEY WENT" columns={[{ label: "PEOPLE" }]} />
              <ol role="list" aria-labelledby="clicks-hosts" className="flex flex-col gap-1 font-bp-mono text-[13px]">
                {hosts.map((row) => (
                  <li key={row.label} className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-bp-ink [overflow-wrap:anywhere]">{row.label}</span>
                    <span className={`w-16 text-bp-ink ${numberClass}`}>
                      {row.clickers.toLocaleString("en-US")}
                      <span className="sr-only"> people</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-bp-secondary">
                Source, announcement and author links only. &ldquo;Followed&rdquo; is the share of the people who opened a project
                who then followed one of those.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
