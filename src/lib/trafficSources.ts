import { db } from "@/lib/db";
import { usesD1 } from "@/lib/cloudflare";
import { d1Store } from "@/lib/d1Runtime";
import { isoMicros } from "@/lib/d1Store";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import { DIRECT_SOURCE, INTERNAL_SOURCE } from "@/lib/visitorRules";
import { summarizeSources, type SourcesSummary } from "@/lib/sourceSummary";
export * from "@/lib/sourceSummary";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Arrivals over the trailing window, one count per distinct visitor per source. Takes no input, so nothing a
 * caller passes can change it. Only rows from when arrivals began to be marked (internal or direct) are read,
 * since before that a click inside the site and a typed address were stored the same way.
 */
export async function getTrafficSources(): Promise<SourcesSummary> {
  if (usesD1()) {
    const { since, rows } = await d1Store().sources(TRAFFIC_WINDOW_DAYS, INTERNAL_SOURCE, DIRECT_SOURCE);
    if (since === null) return { visitors: 0, rows: [], partialSince: null, collecting: true };
    return { ...summarizeSources(rows.map(row => ({ ref: row.ref, referrerHost: row.referrer_host, visitors: row.visitors }))),
      partialSince: since / 1000 > Date.now() - TRAFFIC_WINDOW_DAYS * DAY_MS ? isoMicros(since) : null, collecting: false };
  }
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
