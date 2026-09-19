import { db } from "@/lib/db";
import { MAX_NAMED_ROWS, MIN_SOURCE_VISITORS } from "@/lib/sourceRules";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import { DIRECT_SOURCE, INTERNAL_SOURCE } from "@/lib/visitorEvents";

export interface SourceCounts {
  ref: string | null;
  referrerHost: string | null;
  /** Distinct visitors who arrived from this tag and host in the window. */
  visitors: number;
}

export type SourceRow =
  | { kind: "site"; label: string; visitors: number }
  /** A link the owner tagged with ?ref=. `via` is the site the clicks came through, named only when enough of them did. */
  | { kind: "tag"; label: string; via: string | null; visitors: number }
  | { kind: "direct"; label: string; visitors: number }
  | { kind: "other"; label: string; visitors: number };

export interface SourcesSummary {
  /** Visitors summed over the rows. A visitor who arrived from two different sources is counted in both. */
  visitors: number;
  rows: SourceRow[];
  /** When arrival tracking began, if that was inside the window, so the page can say the numbers are partial. */
  partialSince: string | null;
  /** True until the first arrival has been recorded with a source, when there is nothing to show yet. */
  collecting: boolean;
}

/** Sites people know by a name rather than a hostname. The first match wins. */
const KNOWN_SITES: [RegExp, string][] = [
  [/^((www|m|mobile)\.)?(twitter|x)\.com$|^t\.co$|^com\.twitter\.android$/, "X"],
  [/^(lnkd\.in|(.*\.)?linkedin\.com|com\.linkedin\.android)$/, "LinkedIn"],
  [/^(news\.ycombinator\.com|hn\.algolia\.com)$/, "Hacker News"],
  [/^((.*\.)?reddit\.com|com\.reddit\.frontpage)$/, "Reddit"],
  [/^(.*\.)?github\.com$/, "GitHub"],
  [/^((.*\.)?facebook\.com|fb\.com|fb\.me|com\.facebook\.katana)$/, "Facebook"],
  [/^((.*\.)?instagram\.com|com\.instagram\.android)$/, "Instagram"],
  [/^bsky\.app$/, "Bluesky"],
  [/^((.*\.)?youtube\.com|youtu\.be|com\.google\.android\.youtube)$/, "YouTube"],
  [/^((.*\.)?discord(app)?\.com|com\.discord)$/, "Discord"],
  [/^((.*\.)?slack\.com|com\.slack)$/, "Slack"],
  [/^(t\.me|telegram\.org|web\.telegram\.org|org\.telegram\.messenger)$/, "Telegram"],
  [/^(www\.)?producthunt\.com$/, "Product Hunt"],
  [/^(www\.)?google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$|^com\.google\.android\.googlequicksearchbox$/, "Google"],
  [/^com\.google\.android\.gm$/, "Gmail"],
  [/^(.*\.)?bing\.com$/, "Bing"],
  [/^(.*\.)?duckduckgo\.com$/, "DuckDuckGo"],
  [/^search\.brave\.com$/, "Brave Search"],
  [/^(.*\.)?perplexity\.ai$/, "Perplexity"],
  [/^(chatgpt\.com|chat\.openai\.com)$/, "ChatGPT"],
];

/** A friendly name for a referring hostname: "t.co" is X, "www.google.co.uk" is Google, anything else is the host without "www.". */
export function sourceName(host: string): string {
  const clean = host.toLowerCase();
  for (const [pattern, name] of KNOWN_SITES) if (pattern.test(clean)) return name;
  return clean.replace(/^www\./, "");
}

/**
 * Turns per-host counts into the list the page shows. Clicks inside the site and rows with no host at all
 * (from before arrivals were tracked) are left out. A source with too few visitors is never shown on its own
 * row: it folds into "Other". "Direct or unknown" names no site, so it always stands alone. A tag names the
 * site the clicks came through only when that site alone sent enough of them.
 */
export function summarizeSources(counts: SourceCounts[]): Pick<SourcesSummary, "visitors" | "rows"> {
  const sites = new Map<string, number>();
  const tags = new Map<string, { visitors: number; viaCounts: Map<string, number> }>();
  let direct = 0;

  for (const { ref, referrerHost, visitors } of counts) {
    if (!referrerHost || referrerHost === INTERNAL_SOURCE || visitors <= 0) continue;
    const site = referrerHost === DIRECT_SOURCE ? null : sourceName(referrerHost);

    if (ref) {
      const tag = tags.get(ref) ?? { visitors: 0, viaCounts: new Map() };
      tag.visitors += visitors;
      if (site) tag.viaCounts.set(site, (tag.viaCounts.get(site) ?? 0) + visitors);
      tags.set(ref, tag);
    } else if (site) {
      sites.set(site, (sites.get(site) ?? 0) + visitors);
    } else {
      direct += visitors;
    }
  }

  const named: Extract<SourceRow, { kind: "site" | "tag" }>[] = [
    ...[...sites].map(([label, visitors]) => ({ kind: "site" as const, label, visitors })),
    ...[...tags].map(([label, { visitors, viaCounts }]) => {
      const [topSite, topCount] = [...viaCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [null, 0];
      return { kind: "tag" as const, label, via: topCount >= MIN_SOURCE_VISITORS ? topSite : null, visitors };
    }),
  ].sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label));

  const shown = named.filter((row) => row.visitors >= MIN_SOURCE_VISITORS).slice(0, MAX_NAMED_ROWS);
  const other = named.filter((row) => !shown.includes(row)).reduce((sum, row) => sum + row.visitors, 0);

  const rows: SourceRow[] = [...shown];
  if (direct > 0) rows.push({ kind: "direct", label: "Direct or unknown", visitors: direct });
  rows.sort((a, b) => b.visitors - a.visitors);
  if (other > 0) rows.push({ kind: "other", label: "Other sites and tags", visitors: other });

  return { visitors: rows.reduce((sum, row) => sum + row.visitors, 0), rows };
}

export { MAX_NAMED_ROWS, MIN_SOURCE_VISITORS };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Arrivals over the trailing window, one count per distinct visitor per source. Takes no input, so nothing a
 * caller passes can change it. Only rows from when arrivals began to be marked (internal or direct) are read,
 * since before that a click inside the site and a typed address were stored the same way.
 */
export async function getTrafficSources(): Promise<SourcesSummary> {
  const sql = db();
  const [{ since }] = (await sql`
    SELECT min(created_at) AS since FROM visitor_events WHERE referrer_host IN (${INTERNAL_SOURCE}, ${DIRECT_SOURCE})
  `) as { since: string | null }[];
  if (!since) return { visitors: 0, rows: [], partialSince: null, collecting: true };

  const rows = (await sql`
    SELECT ref, referrer_host,
           (count(DISTINCT visitor_hash) + count(*) FILTER (WHERE visitor_hash IS NULL))::int AS visitors
    FROM visitor_events
    WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
      AND created_at >= ${since}::timestamptz
      AND referrer_host IS NOT NULL
      AND referrer_host <> ${INTERNAL_SOURCE}
    GROUP BY ref, referrer_host
  `) as { ref: string | null; referrer_host: string | null; visitors: number }[];

  const summary = summarizeSources(rows.map((row) => ({ ref: row.ref, referrerHost: row.referrer_host, visitors: row.visitors })));
  const beganInsideWindow = new Date(since).getTime() > Date.now() - TRAFFIC_WINDOW_DAYS * DAY_MS;
  return { ...summary, partialSince: beganInsideWindow ? new Date(since).toISOString() : null, collecting: false };
}
