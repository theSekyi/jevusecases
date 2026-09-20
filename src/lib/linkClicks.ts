import { db } from "@/lib/db";
import {
  LINK_KIND_LABELS,
  MAX_LINK_ROWS,
  MIN_LINK_CLICKERS,
  isLinkKind,
  type LinkKind,
} from "@/lib/linkKinds";
import { sourceLink, type Project } from "@/lib/projects";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";

/** A repeat of the same click by the same visitor inside this is one click: a double-click, or a nervous second press. */
export const DUPLICATE_CLICK_WINDOW_MS = 3000;

// An arbitrary constant that only has to be the same on every instance, and different from the page-view lock.
const CLICK_LOCK_KEY = 41_002;

/** The site a click leads to, worked out from our own data. The browser never says where a link goes. */
export function clickHost(kind: LinkKind, project: Project | null): string | null {
  const url = (() => {
    switch (kind) {
      case "source":
        return project ? sourceLink(project)?.href : null;
      case "tweet":
        return project?.source_tweet;
      case "author":
        return project?.author ? `https://x.com/${project.author.slice(1)}` : null;
      case "share_x":
        return "https://x.com/intent/post";
      case "footer_repo":
        return "https://github.com/theSekyi/jevusecases";
      default:
        return null;
    }
  })();
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Records one click unless the same visitor made the same click a moment ago. Without a visitor hash there is
 * nothing to tell people apart, so repeats of the same click from unidentified visitors are dropped instead.
 */
export async function recordLinkClick(click: {
  kind: LinkKind;
  projectId: string | null;
  host: string | null;
  path: string | null;
  visitorHash: string | null;
}): Promise<void> {
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
          AND kind = ${kind}::text
          AND project_id IS NOT DISTINCT FROM ${projectId}::text
          AND visitor_hash IS NOT DISTINCT FROM ${visitorHash}::text
      )
    `,
  ]);
}

export interface KindRow {
  kind: LinkKind;
  label: string;
  clickers: number;
  clicks: number;
}

export interface ProjectClickRow {
  id: string;
  name: string;
  /** Distinct visitors who opened the project, and how many of them went on to follow one of its links. */
  opened: number;
  followed: number;
}

export interface HostRow {
  host: string;
  clickers: number;
}

export interface LinkClickSummary {
  clicks: number;
  clickers: number;
  /** Kinds with enough clickers to name, then everything smaller as "Other". Clickers in "Other" are summed, so one person can be counted in two kinds. */
  kinds: (KindRow | { kind: "other"; label: string; clickers: number; clicks: number })[];
  projects: ProjectClickRow[];
  hosts: HostRow[];
}

export interface LinkClickCounts {
  total: { clicks: number; clickers: number };
  kinds: { kind: string; clicks: number; clickers: number }[];
  /** Per project: distinct clickers who opened it, and who followed one of its outgoing links. */
  projects: { projectId: string; bucket: "open" | "out"; clickers: number }[];
  hosts: { host: string; clickers: number }[];
}

/** Turns the counts into what the page shows, leaving out any group too small to name. */
export function summarizeLinkClicks(counts: LinkClickCounts, projectName: (id: string) => string | null): LinkClickSummary {
  const named: KindRow[] = [];
  let otherClickers = 0;
  let otherClicks = 0;
  for (const row of counts.kinds) {
    if (!isLinkKind(row.kind)) continue;
    if (row.clickers >= MIN_LINK_CLICKERS) {
      named.push({ kind: row.kind, label: LINK_KIND_LABELS[row.kind], clickers: row.clickers, clicks: row.clicks });
    } else {
      otherClickers += row.clickers;
      otherClicks += row.clicks;
    }
  }
  named.sort((a, b) => b.clickers - a.clickers || a.label.localeCompare(b.label));
  const kinds: LinkClickSummary["kinds"] = [...named];
  if (otherClicks > 0) kinds.push({ kind: "other", label: "Other", clickers: otherClickers, clicks: otherClicks });

  const byProject = new Map<string, { opened: number; followed: number }>();
  for (const row of counts.projects) {
    const entry = byProject.get(row.projectId) ?? { opened: 0, followed: 0 };
    if (row.bucket === "open") entry.opened = row.clickers;
    else entry.followed = row.clickers;
    byProject.set(row.projectId, entry);
  }
  const projects: ProjectClickRow[] = [];
  for (const [id, { opened, followed }] of byProject) {
    if (opened >= MIN_LINK_CLICKERS) projects.push({ id, name: projectName(id) ?? id, opened, followed });
  }
  projects.sort((a, b) => b.opened - a.opened || a.name.localeCompare(b.name));

  const hosts = counts.hosts
    .filter((row) => row.clickers >= MIN_LINK_CLICKERS)
    .sort((a, b) => b.clickers - a.clickers || a.host.localeCompare(b.host))
    .slice(0, MAX_LINK_ROWS);

  return {
    clicks: counts.total.clicks,
    clickers: counts.total.clickers,
    kinds,
    projects: projects.slice(0, MAX_LINK_ROWS),
    hosts,
  };
}

/**
 * Link clicks over the trailing window. Takes no input, so nothing a caller passes can change what it
 * returns. Each group counts distinct visitors; clicks without a visitor hash count once each.
 */
export async function getLinkClickSummary(projectName: (id: string) => string | null): Promise<LinkClickSummary> {
  const sql = db();
  // The outgoing kinds are written into the statements, since a query can't be assembled from pieces; a test
  // checks they match OUTGOING_KINDS.
  const [total, kinds, projects, hosts] = (await sql.transaction([
    sql`
      SELECT count(*)::int AS clicks,
             (count(DISTINCT visitor_hash) + count(*) FILTER (WHERE visitor_hash IS NULL))::int AS clickers
      FROM link_clicks
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
    `,
    sql`
      SELECT kind, count(*)::int AS clicks,
             (count(DISTINCT visitor_hash) + count(*) FILTER (WHERE visitor_hash IS NULL))::int AS clickers
      FROM link_clicks
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
      GROUP BY kind
    `,
    sql`
      SELECT project_id, bucket,
             (count(DISTINCT visitor_hash) + count(*) FILTER (WHERE visitor_hash IS NULL))::int AS clickers
      FROM (
        SELECT project_id, visitor_hash,
               CASE WHEN kind = 'project_open' THEN 'open' WHEN kind IN ('source', 'tweet', 'author') THEN 'out' END AS bucket
        FROM link_clicks
        WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval AND project_id IS NOT NULL
      ) tagged
      WHERE bucket IS NOT NULL
      GROUP BY project_id, bucket
    `,
    sql`
      SELECT host,
             (count(DISTINCT visitor_hash) + count(*) FILTER (WHERE visitor_hash IS NULL))::int AS clickers
      FROM link_clicks
      WHERE created_at > now() - (${TRAFFIC_WINDOW_DAYS}::text || ' days')::interval
        AND host IS NOT NULL AND kind IN ('source', 'tweet', 'author')
      GROUP BY host
    `,
  ])) as [
    { clicks: number; clickers: number }[],
    { kind: string; clicks: number; clickers: number }[],
    { project_id: string; bucket: "open" | "out"; clickers: number }[],
    { host: string; clickers: number }[],
  ];

  return summarizeLinkClicks(
    {
      total: total[0] ?? { clicks: 0, clickers: 0 },
      kinds,
      projects: projects.map((row) => ({ projectId: row.project_id, bucket: row.bucket, clickers: row.clickers })),
      hosts,
    },
    projectName,
  );
}
