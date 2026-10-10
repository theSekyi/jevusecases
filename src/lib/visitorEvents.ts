import { db } from "@/lib/db";
import { usesD1 } from "@/lib/cloudflare";
import { d1Store } from "@/lib/d1Runtime";
import { LIVE_WINDOW_MS, VISIBLE_EVENT_COUNT, type VisitorEvent } from "@/lib/visitorFormat";

export * from "@/lib/visitorRules";
import { type VisitSource } from "@/lib/visitorRules";
const RECORD_LOCK_KEY = 41_001;
const DUPLICATE_WINDOW_MS = 3000;

/**
 * Records a page view unless the same visitor was recorded within DUPLICATE_WINDOW_MS. Without a
 * visitor hash the only thing to go on is the country, so repeats from one country are dropped instead.
 */
export async function recordVisitorEvent(
  country: string | null,
  path: string,
  visitorHash: string | null,
  source: VisitSource,
): Promise<void> {
  if (usesD1()) return d1Store().recordVisit({ country, path, visitorHash, ...source });
  const sql = db();
  // The lock makes check-then-insert atomic: a concurrent call waits for this transaction to commit
  // before running its own check, so it sees the row instead of racing past it. The timeout keeps a
  // burst of requests from queuing on the lock for long; a timed-out call is just not recorded.
  await sql.transaction([
    sql`SET LOCAL lock_timeout = '2s'`,
    sql`SELECT pg_advisory_xact_lock(${RECORD_LOCK_KEY})`,
    sql`
      INSERT INTO visitor_events (country, path, visitor_hash, ref, referrer_host)
      SELECT ${country}::text, ${path}::text, ${visitorHash}::text, ${source.ref}::text, ${source.referrerHost}::text
      WHERE NOT EXISTS (
        SELECT 1 FROM visitor_events
        WHERE created_at > now() - (${DUPLICATE_WINDOW_MS}::text || ' milliseconds')::interval
          AND (
            (${visitorHash}::text IS NOT NULL AND visitor_hash = ${visitorHash}::text)
            OR (${visitorHash}::text IS NULL AND visitor_hash IS NULL AND country IS NOT DISTINCT FROM ${country}::text)
          )
      )
    `,
  ]);
}

export async function getRecentVisitorEvents(limit = VISIBLE_EVENT_COUNT): Promise<VisitorEvent[]> {
  if (usesD1()) return d1Store().recentVisits(LIVE_WINDOW_MS, limit);
  const sql = db();
  const rows = (await sql`
    SELECT id, country, path, created_at
    FROM visitor_events
    WHERE created_at > now() - (${LIVE_WINDOW_MS}::text || ' milliseconds')::interval
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as { id: number; country: string | null; path: string; created_at: string }[];

  return rows.map((row) => ({
    id: row.id,
    country: row.country,
    path: row.path,
    createdAt: row.created_at,
  }));
}
