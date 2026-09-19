import { db } from "@/lib/db";

export interface VisitorEvent {
  id: number;
  country: string | null;
  path: string;
  createdAt: string;
}

/** How long an event stays visible in the live strip. Storage itself is unaffected — rows are kept for a later aggregation view. */
export const LIVE_WINDOW_MS = 3 * 60 * 1000;

/** How many recent events the live strip actually shows — callers should ask for exactly this many, not more. */
export const VISIBLE_EVENT_COUNT = 5;

const EMOJI_FLAG_OFFSET = 127397;
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

/** True for a plausible ISO 3166-1 alpha-2 code — a cheap shape check, not a lookup against the real list. */
export function isValidCountryCode(countryCode: string | null | undefined): countryCode is string {
  return typeof countryCode === "string" && COUNTRY_CODE_PATTERN.test(countryCode);
}

/** Turns an ISO 3166-1 alpha-2 country code into its flag emoji, e.g. "US" -> "🇺🇸". */
export function countryCodeToFlag(countryCode: string | null): string | null {
  if (!isValidCountryCode(countryCode)) return null;
  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => EMOJI_FLAG_OFFSET + char.charCodeAt(0),
  );
  return String.fromCodePoint(...codePoints);
}

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });

/** A human-readable country name for display, falling back to a generic label when there's no real geolocation (e.g. local dev). */
export function countryName(countryCode: string | null): string {
  if (!isValidCountryCode(countryCode)) return "Somewhere";
  try {
    return countryDisplayNames.of(countryCode.toUpperCase()) ?? countryCode;
  } catch {
    return countryCode;
  }
}

/** A short "Ns ago" / "Nm ago" label for how long ago an ISO timestamp was, relative to `now`. */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/**
 * One page load can reach the server as several requests, and production runs several instances, so
 * repeats are dropped here, where every instance shares one view, instead of in each instance's memory.
 */
export const DUPLICATE_WINDOW_MS = 3000;

// An arbitrary constant that only has to be the same on every instance.
const RECORD_LOCK_KEY = 41_001;

/** Where a view came from: a `?ref=` tag we put on our own links, and the site that linked here. */
export interface VisitSource {
  ref: string | null;
  referrerHost: string | null;
}

export const NO_SOURCE: VisitSource = { ref: null, referrerHost: null };

const REF_PATTERN = /^[a-z0-9_-]{1,40}$/;
const OWN_HOSTS = new Set(["jevusecases.com", "www.jevusecases.com", "localhost"]);

/**
 * Reads the source of a view from the URL and the Referer header. Both come from the client, so only a
 * short ref tag and a bare hostname are kept: never the full referring URL, which can carry personal data.
 */
export function visitSource(url: URL, referer: string | null): VisitSource {
  const rawRef = url.searchParams.get("ref")?.toLowerCase() ?? "";
  let referrerHost: string | null = null;
  if (referer) {
    try {
      const host = new URL(referer).hostname.toLowerCase();
      if (host && host.length <= 253 && !OWN_HOSTS.has(host)) referrerHost = host;
    } catch {
      referrerHost = null;
    }
  }
  return { ref: REF_PATTERN.test(rawRef) ? rawRef : null, referrerHost };
}

/**
 * Records a page view unless the same visitor was recorded within DUPLICATE_WINDOW_MS. Without a
 * visitor hash the only thing to go on is the country, so repeats from one country are dropped instead.
 */
export async function recordVisitorEvent(
  country: string | null,
  path: string,
  visitorHash: string | null = null,
  source: VisitSource = NO_SOURCE,
): Promise<void> {
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
