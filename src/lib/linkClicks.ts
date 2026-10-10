import { db } from "@/lib/db";
import { usesD1 } from "@/lib/cloudflare";
import { d1Store } from "@/lib/d1Runtime";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import { summarizeLinkClicks, type LinkClickSummary } from "@/lib/clickSummary";
import type { LinkKind } from "@/lib/linkKinds";
export * from "@/lib/clickSummary";
const CLICK_LOCK_KEY = 41_002;
const DUPLICATE_CLICK_WINDOW_MS = 3000;
export async function recordLinkClick(click: {
  kind: LinkKind;
  projectId: string | null;
  host: string | null;
  path: string | null;
  visitorHash: string;
}): Promise<void> {
  if (usesD1()) return d1Store().recordClick(click);
  const sql = db();
  const { kind, projectId, host, path, visitorHash } = click;
  // The lock makes check-then-insert atomic across instances, as it does for page views.
  await sql.transaction([
    sql`SET LOCAL lock_timeout = '2s'`,
    sql`SELECT pg_advisory_xact_lock(${CLICK_LOCK_KEY})`,
    sql`
      INSERT INTO link_clicks (visitor_hash, kind, project_id, host, path)
      SELECT ${visitorHash}::text, ${kind}::text, ${projectId}::text, ${host}::text, ${path}::text
      WHERE NOT EXISTS (
        SELECT 1 FROM link_clicks
        WHERE created_at > now() - (${DUPLICATE_CLICK_WINDOW_MS}::text || ' milliseconds')::interval
          AND visitor_hash = ${visitorHash}::text
          AND kind = ${kind}::text
          AND project_id IS NOT DISTINCT FROM ${projectId}::text
      )
    `,
  ]);
}


/**
 * Link clicks over the trailing window. Takes no input, so nothing a caller passes can change what it
 * returns. Each group counts distinct visitors.
 */
export async function getLinkClickSummary(projectName: (id: string) => string | null): Promise<LinkClickSummary> {
  if (usesD1()) return summarizeLinkClicks(await d1Store().clickCounts(TRAFFIC_WINDOW_DAYS), projectName);
  const sql = db();
  // The outgoing kinds are written into the statement, since a query can't be assembled from pieces; a test
  // checks they match OUTGOING_KINDS.
  const [total, kinds, projects, hosts] = (await sql.transaction([
    sql`
      SELECT count(*)::int AS clicks, count(DISTINCT visitor_hash)::int AS clickers
      FROM link_clicks
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
    `,
    sql`
      SELECT kind, count(*)::int AS clicks, count(DISTINCT visitor_hash)::int AS clickers
      FROM link_clicks
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
      GROUP BY kind
    `,
    sql`
      SELECT project_id,
             (count(*) FILTER (WHERE opened))::int AS opened,
             (count(*) FILTER (WHERE opened AND followed))::int AS followed
      FROM (
        SELECT project_id, visitor_hash,
               bool_or(kind = 'project_open') AS opened,
               bool_or(kind IN ('source', 'tweet', 'author')) AS followed
        FROM link_clicks
        WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval AND project_id IS NOT NULL
        GROUP BY project_id, visitor_hash
      ) per_visitor
      GROUP BY project_id
    `,
    sql`
      SELECT host, count(DISTINCT visitor_hash)::int AS clickers
      FROM link_clicks
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
        AND host IS NOT NULL AND kind IN ('source', 'tweet', 'author')
      GROUP BY host
    `,
  ])) as [
    { clicks: number; clickers: number }[],
    { kind: string; clicks: number; clickers: number }[],
    { project_id: string; opened: number; followed: number }[],
    { host: string; clickers: number }[],
  ];

  return summarizeLinkClicks(
    {
      total: total[0] ?? { clicks: 0, clickers: 0 },
      kinds,
      projects: projects.map((row) => ({ projectId: row.project_id, opened: row.opened, followed: row.followed })),
      hosts,
    },
    projectName,
  );
}
