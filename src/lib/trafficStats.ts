import { db } from "@/lib/db";
import { isValidCountryCode } from "@/lib/visitorEvents";

/** The one window this page reports, fixed on purpose. */
export const TRAFFIC_WINDOW_DAYS = 7;

/** Fewer page views than this is too few to show on its own row. */
export const MIN_COUNTRY_VIEWS = 3;

/** A row with identified visitors needs at least this many, so no row can be one person reloading. */
export const MIN_COUNTRY_VISITORS = 2;

/** One country's page views, and how many distinct visitors made them (visitors with no recorded identity aren't counted). */
export interface CountryCounts {
  country: string | null;
  views: number;
  visitors: number;
}

export type TrafficRow =
  | { kind: "country"; country: string; views: number; visitors: number }
  | { kind: "unknown"; views: number; visitors: number }
  | { kind: "other"; views: number; visitors: number };

export interface TrafficSummary {
  /** All page views in the window. */
  views: number;
  /** Distinct visitors in the window, across all countries. */
  visitors: number;
  /** Visitors seen on two or more different days in the window. */
  returning: number;
  rows: TrafficRow[];
}

type CountryRow = Extract<TrafficRow, { kind: "country" }>;

/** Zero visitors means the views carry no identity (older rows, or no address), so only views can be judged. */
function tooSmall({ views, visitors }: { views: number; visitors: number }): boolean {
  return views < MIN_COUNTRY_VIEWS || (visitors > 0 && visitors < MIN_COUNTRY_VISITORS);
}

/**
 * Ranks countries by page views. Small counts are never shown on their own: a country under the
 * minimum is folded into "other", and if "other" is still under the minimum it absorbs the smallest
 * named countries until it isn't, so no row is small enough to point at one person. Locations that
 * are missing or malformed get an "unknown" row on the same terms. A row's visitors are counted per
 * country, so someone seen under two countries appears in both; the overall figure counts them once.
 */
export function summarizeCountries(counts: CountryCounts[]): { views: number; rows: TrafficRow[] } {
  const byCountry = new Map<string, { views: number; visitors: number }>();
  const unknown = { views: 0, visitors: 0 };

  for (const { country, views, visitors } of counts) {
    let bucket = unknown;
    if (isValidCountryCode(country)) {
      const code = country.toUpperCase();
      bucket = byCountry.get(code) ?? { views: 0, visitors: 0 };
      byCountry.set(code, bucket);
    }
    bucket.views += views;
    bucket.visitors += visitors;
  }

  const named: CountryRow[] = [];
  const other = { views: 0, visitors: 0 };
  const foldIntoOther = (part: { views: number; visitors: number }) => {
    other.views += part.views;
    other.visitors += part.visitors;
  };

  for (const [country, counted] of byCountry) {
    if (tooSmall(counted)) foldIntoOther(counted);
    else named.push({ kind: "country", country, ...counted });
  }
  named.sort((a, b) => b.views - a.views || a.country.localeCompare(b.country));

  if (unknown.views > 0 && tooSmall(unknown)) {
    foldIntoOther(unknown);
    unknown.views = 0;
    unknown.visitors = 0;
  }
  while (other.views > 0 && tooSmall(other) && named.length > 0) {
    const { views, visitors } = named.pop()!;
    foldIntoOther({ views, visitors });
  }

  const rows: TrafficRow[] = [...named];
  if (unknown.views > 0) rows.push({ kind: "unknown", ...unknown });
  if (other.views > 0) rows.push({ kind: "other", ...other });
  return { views: rows.reduce((sum, row) => sum + row.views, 0), rows };
}

/** A row's share of the total as a short label: one decimal below 10%, whole numbers above, "<0.1%" for slivers. */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return "0%";
  const share = (part / total) * 100;
  if (share < 0.1) return "<0.1%";
  const oneDecimal = Number(share.toFixed(1));
  return oneDecimal < 10 ? `${oneDecimal.toFixed(1)}%` : `${Math.round(share)}%`;
}

/** Page views, unique visitors and returning visitors over the trailing window. Takes no input, so nothing a caller passes can change what it returns. */
export async function getTrafficSummary(): Promise<TrafficSummary> {
  const sql = db();
  const [countryRows, totals] = await Promise.all([
    sql`
      SELECT country, count(*)::int AS views, count(DISTINCT visitor_hash)::int AS visitors
      FROM visitor_events
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
      GROUP BY country
    `,
    sql`
      SELECT count(*)::int AS visitors, (count(*) FILTER (WHERE days > 1))::int AS returning
      FROM (
        SELECT count(DISTINCT (created_at AT TIME ZONE 'UTC')::date) AS days
        FROM visitor_events
        WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
          AND visitor_hash IS NOT NULL
        GROUP BY visitor_hash
      ) per_visitor
    `,
  ]);

  const { views, rows } = summarizeCountries(countryRows as CountryCounts[]);
  const { visitors, returning } = (totals as { visitors: number; returning: number }[])[0];
  return { views, visitors, returning, rows };
}
