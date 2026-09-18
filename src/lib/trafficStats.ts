import { db } from "@/lib/db";
import { isValidCountryCode } from "@/lib/visitorEvents";

/** The one window this page reports. It is fixed on purpose: nothing a caller passes can widen it. */
export const TRAFFIC_WINDOW_DAYS = 7;

/** A country with fewer visits than this is folded into "other", so a count of 1 can't point at one person. */
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

/** Ranks countries by visits; small countries and missing locations get their own rows at the end. */
export function summarizeTraffic(counts: CountryVisits[], minVisits = MIN_COUNTRY_VISITS): TrafficSummary {
  const named: { kind: "country"; country: string; visits: number }[] = [];
  let unknown = 0;
  let other = 0;

  for (const { country, visits } of counts) {
    if (!isValidCountryCode(country)) unknown += visits;
    else if (visits < minVisits) other += visits;
    else named.push({ kind: "country", country: country.toUpperCase(), visits });
  }
  named.sort((a, b) => b.visits - a.visits || a.country.localeCompare(b.country));

  const rows: TrafficRow[] = [...named];
  if (unknown > 0) rows.push({ kind: "unknown", visits: unknown });
  if (other > 0) rows.push({ kind: "other", visits: other });
  return { total: rows.reduce((sum, row) => sum + row.visits, 0), rows };
}

/** Visits per country over the trailing window. Takes no input: this is the only shape of data the page can get. */
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
