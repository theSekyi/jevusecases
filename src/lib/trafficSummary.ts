import { isValidCountryCode } from "@/lib/visitorFormat";

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
