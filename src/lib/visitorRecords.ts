import type { NeonQueryFunction } from "@neondatabase/serverless";
import { normalizeIp } from "./rateLimit.ts";
import { hashVisitor } from "./visitorHash.ts";

// Imported by a plain-Node script, so relative paths with explicit extensions.

type Sql = NeonQueryFunction<false, false>;

const IP_SHAPE = /^[0-9a-fA-F:.]+(%[\w.-]+)?$/;

export interface VisitorRecords {
  views: number;
  firstSeen: string | null;
  lastSeen: string | null;
  countries: string[];
}

/**
 * The hash the site stored for a visitor on this IP, built the same way the proxy builds it (the
 * address goes through the same normalization first, so a full IPv6 address matches its /64).
 * Null when the input isn't an IP or the secret isn't available.
 */
export function visitorHashForIp(ip: string): string | null {
  const trimmed = ip.trim();
  if (!trimmed || !IP_SHAPE.test(trimmed) || !/[.:]/.test(trimmed)) return null;
  return hashVisitor(normalizeIp(trimmed));
}

export async function lookupVisitorRecords(sql: Sql, hash: string): Promise<VisitorRecords> {
  const [row] = (await sql`
    SELECT count(*)::int AS views, min(created_at) AS first_seen, max(created_at) AS last_seen,
           coalesce(array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL), '{}') AS countries
    FROM visitor_events
    WHERE visitor_hash = ${hash}
  `) as { views: number; first_seen: string | null; last_seen: string | null; countries: string[] }[];
  return { views: row.views, firstSeen: row.first_seen, lastSeen: row.last_seen, countries: row.countries };
}

/** Deletes every record for this hash and returns how many there were. */
export async function deleteVisitorRecords(sql: Sql, hash: string): Promise<number> {
  const deleted = (await sql`DELETE FROM visitor_events WHERE visitor_hash = ${hash} RETURNING id`) as unknown[];
  return deleted.length;
}
