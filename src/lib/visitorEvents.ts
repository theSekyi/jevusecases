import { db } from "@/lib/db";

export interface VisitorEvent {
  id: number;
  country: string | null;
  path: string;
  createdAt: string;
}

/** How long an event stays visible in the live strip. Storage itself is unaffected — rows are kept for 005's aggregation. */
export const LIVE_WINDOW_MS = 3 * 60 * 1000;

const EMOJI_FLAG_OFFSET = 127397;

/** Turns an ISO 3166-1 alpha-2 country code into its flag emoji, e.g. "US" -> "🇺🇸". */
export function countryCodeToFlag(countryCode: string | null): string | null {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return null;
  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => EMOJI_FLAG_OFFSET + char.charCodeAt(0),
  );
  return String.fromCodePoint(...codePoints);
}

export async function recordVisitorEvent(country: string | null, path: string): Promise<void> {
  const sql = db();
  await sql`INSERT INTO visitor_events (country, path) VALUES (${country}, ${path})`;
}

export async function getRecentVisitorEvents(limit = 20): Promise<VisitorEvent[]> {
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
