import { db } from "@/lib/db";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/trafficStats";
import { DIRECT_SOURCE, INTERNAL_SOURCE } from "@/lib/visitorEvents";

/** Fewer landings than this is too few to name a source on its own row. */
export const MIN_SOURCE_LANDINGS = 3;

export interface SourceCounts {
  ref: string | null;
  referrerHost: string | null;
  landings: number;
}

export type SourceRow =
  | { kind: "site"; label: string; landings: number }
  /** A link the owner tagged with ?ref=. `via` is the site the click came from, when there was one. */
  | { kind: "tag"; label: string; via: string | null; landings: number }
  | { kind: "direct"; label: string; landings: number }
  | { kind: "other"; label: string; landings: number };

export interface SourcesSummary {
  landings: number;
  rows: SourceRow[];
}

/** Sites people know by a name rather than a hostname. The first match wins. */
const KNOWN_SITES: [RegExp, string][] = [
  [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/, "X"],
  [/^(lnkd\.in|linkedin\.com|.*\.linkedin\.com)$/, "LinkedIn"],
  [/^(news\.ycombinator\.com|hn\.algolia\.com)$/, "Hacker News"],
  [/^(reddit\.com|.*\.reddit\.com)$/, "Reddit"],
  [/^(github\.com|.*\.github\.com|gist\.github\.com)$/, "GitHub"],
  [/^(facebook\.com|.*\.facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
  [/^(instagram\.com|.*\.instagram\.com|l\.instagram\.com)$/, "Instagram"],
  [/^bsky\.app$/, "Bluesky"],
  [/^(youtube\.com|.*\.youtube\.com|youtu\.be)$/, "YouTube"],
  [/^(discord\.com|discordapp\.com|.*\.discord\.com)$/, "Discord"],
  [/^(slack\.com|.*\.slack\.com|app\.slack\.com)$/, "Slack"],
  [/^(t\.me|telegram\.org|web\.telegram\.org)$/, "Telegram"],
  [/^(producthunt\.com|www\.producthunt\.com)$/, "Product Hunt"],
  [/^(.*\.)?google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2,3})$/, "Google"],
  [/^(bing\.com|.*\.bing\.com)$/, "Bing"],
  [/^(duckduckgo\.com|.*\.duckduckgo\.com)$/, "DuckDuckGo"],
  [/^(search\.brave\.com)$/, "Brave Search"],
  [/^(perplexity\.ai|.*\.perplexity\.ai)$/, "Perplexity"],
  [/^(chatgpt\.com|chat\.openai\.com)$/, "ChatGPT"],
];

/** A friendly name for a referring hostname: "t.co" is X, "www.google.co.uk" is Google, anything else is the host without "www.". */
export function sourceName(host: string): string {
  const clean = host.toLowerCase();
  for (const [pattern, name] of KNOWN_SITES) if (pattern.test(clean)) return name;
  return clean.replace(/^www\./, "");
}

/**
 * Turns per-host counts into the list the page shows. Clicks inside the site and rows from before source
 * tracking (no host at all) are left out: they aren't landings. Small sources are never shown alone: they
 * fold into "Other sites", which absorbs the smallest named site (tags last) until it is no longer small. "Direct or
 * unknown" names no site, so it always stands alone.
 */
export function summarizeSources(counts: SourceCounts[]): SourcesSummary {
  const sites = new Map<string, number>();
  const tags = new Map<string, { landings: number; viaCounts: Map<string, number> }>();
  let direct = 0;

  for (const { ref, referrerHost, landings } of counts) {
    if (!referrerHost || referrerHost === INTERNAL_SOURCE || landings <= 0) continue;
    const site = referrerHost === DIRECT_SOURCE ? null : sourceName(referrerHost);

    if (ref) {
      const tag = tags.get(ref) ?? { landings: 0, viaCounts: new Map() };
      tag.landings += landings;
      if (site) tag.viaCounts.set(site, (tag.viaCounts.get(site) ?? 0) + landings);
      tags.set(ref, tag);
    } else if (site) {
      sites.set(site, (sites.get(site) ?? 0) + landings);
    } else {
      direct += landings;
    }
  }

  const named: Exclude<SourceRow, { kind: "direct" | "other" }>[] = [
    ...[...sites].map(([label, landings]) => ({ kind: "site" as const, label, landings })),
    ...[...tags].map(([label, { landings, viaCounts }]) => ({
      kind: "tag" as const,
      label,
      via: [...viaCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
      landings,
    })),
  ].sort((a, b) => b.landings - a.landings || a.label.localeCompare(b.label));

  const standing = named.filter((row) => row.landings >= MIN_SOURCE_LANDINGS);
  let other = named.filter((row) => row.landings < MIN_SOURCE_LANDINGS).reduce((sum, row) => sum + row.landings, 0);
  while (other > 0 && other < MIN_SOURCE_LANDINGS && standing.length > 0) {
    // The smallest site goes first. A tag is a link the owner chose to name, so it is the last thing to be hidden.
    const sites = standing.map((row, index) => (row.kind === "site" ? index : -1)).filter((index) => index >= 0);
    other += standing.splice(sites.length > 0 ? sites[sites.length - 1] : standing.length - 1, 1)[0].landings;
  }

  const rows: SourceRow[] = [...standing];
  if (direct > 0) rows.push({ kind: "direct", label: "Direct or unknown", landings: direct });
  rows.sort((a, b) => b.landings - a.landings);
  if (other > 0) rows.push({ kind: "other", label: "Other sites", landings: other });

  return { landings: rows.reduce((sum, row) => sum + row.landings, 0), rows };
}

/** Landings over the trailing window, grouped by ref tag and referring host. Takes no input, so nothing a caller passes can change it. */
export async function getTrafficSources(): Promise<SourcesSummary> {
  const sql = db();
  const rows = (await sql`
    SELECT ref, referrer_host, count(*)::int AS landings
    FROM visitor_events
    WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
      AND referrer_host IS NOT NULL
      AND referrer_host <> ${INTERNAL_SOURCE}
    GROUP BY ref, referrer_host
  `) as { ref: string | null; referrer_host: string | null; landings: number }[];

  return summarizeSources(rows.map((row) => ({ ref: row.ref, referrerHost: row.referrer_host, landings: row.landings })));
}
