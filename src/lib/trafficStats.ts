import { db } from "@/lib/db";
import { usesD1 } from "@/lib/cloudflare";
import { d1Store } from "@/lib/d1Runtime";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import { summarizeCountries, type TrafficSummary, type CountryCounts } from "@/lib/trafficSummary";
export * from "@/lib/trafficSummary";

/** Page views, unique visitors and returning visitors over the trailing window. Takes no input, so nothing a caller passes can change what it returns. */
export async function getTrafficSummary(): Promise<TrafficSummary> {
  if (usesD1()) {
    const { countries, totals } = await d1Store().traffic(TRAFFIC_WINDOW_DAYS);
    return { ...summarizeCountries(countries), ...totals };
  }
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
