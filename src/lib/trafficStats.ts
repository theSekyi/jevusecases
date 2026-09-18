import { db } from "@/lib/db";
import { isValidCountryCode } from "@/lib/visitorEvents";

/** The one window this page reports, fixed on purpose. */
export const TRAFFIC_WINDOW_DAYS = 7;

/** Fewer visits than this is too few to show on its own row. */
export const MIN_COUNTRY_VISITS = 3;

export interface CountryVisits {
  country: string | null;
  visits: number;
}

export type TrafficRow =
  | { kind: "country"; country: string; visits: number }
  | { kind: "unknown"; visits: number }
  | { kind: "other"; visits: number };

export interface TrafficSummary {
  total: number;
  rows: TrafficRow[];
}

/**
 * Ranks countries by visits. Small counts are never shown on their own: a country under the minimum
 * is folded into "other", and if "other" is still under the minimum it absorbs the smallest named
 * countries until it isn't, so no row is small enough to point at one person. Locations that are
 * missing or malformed get an "unknown" row on the same terms.
 */
export function summarizeTraffic(counts: CountryVisits[]): TrafficSummary {
  const byCountry = new Map<string, number>();
  let unknown = 0;

  for (const { country, visits } of counts) {
    if (!isValidCountryCode(country)) unknown += visits;
    else byCountry.set(country.toUpperCase(), (byCountry.get(country.toUpperCase()) ?? 0) + visits);
  }

  const named: { kind: "country"; country: string; visits: number }[] = [];
  let other = 0;
  for (const [country, visits] of byCountry) {
    if (visits < MIN_COUNTRY_VISITS) other += visits;
    else named.push({ kind: "country", country, visits });
  }
  named.sort((a, b) => b.visits - a.visits || a.country.localeCompare(b.country));

  if (unknown > 0 && unknown < MIN_COUNTRY_VISITS) {
    other += unknown;
    unknown = 0;
  }
  while (other > 0 && other < MIN_COUNTRY_VISITS && named.length > 0) {
    other += named.pop()!.visits;
  }

  const rows: TrafficRow[] = [...named];
  if (unknown > 0) rows.push({ kind: "unknown", visits: unknown });
  if (other > 0) rows.push({ kind: "other", visits: other });
  return { total: rows.reduce((sum, row) => sum + row.visits, 0), rows };
}

/** A row's share of the total as a short label: one decimal below 10%, whole numbers above, "<0.1%" for slivers. */
export function formatShare(visits: number, total: number): string {
  if (total <= 0) return "0%";
  const share = (visits / total) * 100;
  if (share < 0.1) return "<0.1%";
  const oneDecimal = Number(share.toFixed(1));
  return oneDecimal < 10 ? `${oneDecimal.toFixed(1)}%` : `${Math.round(share)}%`;
}

/** Visits per country over the trailing window. Takes no input, so nothing a caller passes can change what it returns. */
export async function getTrafficSummary(): Promise<TrafficSummary> {
  const sql = db();
  const rows = (await sql`
    SELECT country, count(*)::int AS visits
    FROM visitor_events
    WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
    GROUP BY country
  `) as CountryVisits[];
  return summarizeTraffic(rows);
}
