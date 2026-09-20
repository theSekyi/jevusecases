import { db } from "@/lib/db";
import { LINK_KIND_LABELS, MAX_LINK_ROWS, MIN_LINK_CLICKERS, isLinkKind, type LinkKind } from "@/lib/linkKinds";
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
 * Records one click unless the same visitor made the same click a moment ago. A click needs a visitor hash:
 * without one there is no telling people apart, and every click would have to count as its own person.
 */
export async function recordLinkClick(click: {
  kind: LinkKind;
  projectId: string | null;
  host: string | null;
  path: string | null;
  visitorHash: string;
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
          AND visitor_hash = ${visitorHash}::text
          AND kind = ${kind}::text
          AND project_id IS NOT DISTINCT FROM ${projectId}::text
      )
    `,
  ]);
}

export interface KindRow {
  kind: LinkKind | "other";
  label: string;
  clickers: number;
  clicks: number;
}

export interface ProjectClickRow {
  /** Null for the row that gathers the projects too small to name. */
  id: string | null;
  name: string;
  /** Distinct visitors who opened the project. */
  opened: number;
  /** Of those, how many followed one of its links. Null when fewer than the floor, so a small number is never sent to the page. */
  followed: number | null;
}

export interface HostRow {
  label: string;
  clickers: number;
  other: boolean;
}

export interface LinkClickSummary {
  clicks: number;
  clickers: number;
  /** Some clicks exist, but from too few people to show anything without pointing at them. */
  tooFew: boolean;
  /** Kinds with enough people to name, then the rest as "Other" (people in "Other" are summed, so one person can be counted in two kinds). */
  kinds: KindRow[];
  projects: ProjectClickRow[];
  hosts: HostRow[];
}

export interface LinkClickCounts {
  total: { clicks: number; clickers: number };
  kinds: { kind: string; clicks: number; clickers: number }[];
  /** Per project: visitors who opened it, and how many of them followed one of its links. */
  projects: { projectId: string; opened: number; followed: number }[];
  hosts: { host: string; clickers: number }[];
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A number of people small enough to point at someone is left out. */
const floor = (people: number) => (people >= MIN_LINK_CLICKERS ? people : null);

/**
 * Turns the counts into what the page shows. No group of fewer than MIN_LINK_CLICKERS people is shown, or
 * even sent to the page. What is too small to name is gathered into "Other", which appears only once that
 * pile is itself big enough.
 */
export function summarizeLinkClicks(counts: LinkClickCounts, projectName: (id: string) => string | null): LinkClickSummary {
  const { total } = counts;
  if (total.clickers < MIN_LINK_CLICKERS) {
    return { clicks: 0, clickers: 0, tooFew: total.clicks > 0, kinds: [], projects: [], hosts: [] };
  }

  const known = counts.kinds.filter((row): row is { kind: LinkKind; clicks: number; clickers: number } => isLinkKind(row.kind));
  const kinds: KindRow[] = known
    .filter((row) => row.clickers >= MIN_LINK_CLICKERS)
    .map((row) => ({ kind: row.kind, label: LINK_KIND_LABELS[row.kind], clickers: row.clickers, clicks: row.clicks }))
    .sort((a, b) => b.clickers - a.clickers || a.label.localeCompare(b.label));
  const smallKinds = known.filter((row) => row.clickers < MIN_LINK_CLICKERS);
  if (sum(smallKinds.map((row) => row.clickers)) >= MIN_LINK_CLICKERS) {
    kinds.push({
      kind: "other",
      label: "Other",
      clickers: sum(smallKinds.map((row) => row.clickers)),
      clicks: sum(smallKinds.map((row) => row.clicks)),
    });
  }

  const nameOf = (id: string) => projectName(id) ?? id;
  const bigProjects = counts.projects
    .filter((row) => row.opened >= MIN_LINK_CLICKERS)
    .sort((a, b) => b.opened - a.opened || nameOf(a.projectId).localeCompare(nameOf(b.projectId)));
  const projects: ProjectClickRow[] = bigProjects
    .slice(0, MAX_LINK_ROWS)
    .map((row) => ({ id: row.projectId, name: nameOf(row.projectId), opened: row.opened, followed: floor(row.followed) }));
  const otherProjects = [...bigProjects.slice(MAX_LINK_ROWS), ...counts.projects.filter((row) => row.opened < MIN_LINK_CLICKERS)];
  if (sum(otherProjects.map((row) => row.opened)) >= MIN_LINK_CLICKERS) {
    projects.push({
      id: null,
      name: "Other projects",
      opened: sum(otherProjects.map((row) => row.opened)),
      followed: floor(sum(otherProjects.map((row) => row.followed))),
    });
  }

  const bigHosts = counts.hosts
    .filter((row) => row.clickers >= MIN_LINK_CLICKERS)
    .sort((a, b) => b.clickers - a.clickers || a.host.localeCompare(b.host));
  const hosts: HostRow[] = bigHosts
    .slice(0, MAX_LINK_ROWS)
    .map((row) => ({ label: row.host, clickers: row.clickers, other: false }));
  const otherHosts = [...bigHosts.slice(MAX_LINK_ROWS), ...counts.hosts.filter((row) => row.clickers < MIN_LINK_CLICKERS)];
  if (sum(otherHosts.map((row) => row.clickers)) >= MIN_LINK_CLICKERS) {
    hosts.push({ label: "Other sites", clickers: sum(otherHosts.map((row) => row.clickers)), other: true });
  }

  return { clicks: total.clicks, clickers: total.clickers, tooFew: false, kinds, projects, hosts };
}

/**
 * Link clicks over the trailing window. Takes no input, so nothing a caller passes can change what it
 * returns. Each group counts distinct visitors.
 */
export async function getLinkClickSummary(projectName: (id: string) => string | null): Promise<LinkClickSummary> {
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
