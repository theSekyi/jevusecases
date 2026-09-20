// The kinds of link click the site counts. No database import, so links and the click listener in the
// browser can share it with the server.

export const LINK_KINDS = [
  "project_open",
  "source",
  "tweet",
  "author",
  "share_x",
  "copy_link",
  "copy_install",
  "submit",
  "footer_repo",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export function isLinkKind(value: unknown): value is LinkKind {
  return typeof value === "string" && (LINK_KINDS as readonly string[]).includes(value);
}

/** The kinds that belong to one project, so a click of these names it. */
const PROJECT_KINDS: ReadonlySet<LinkKind> = new Set([
  "project_open",
  "source",
  "tweet",
  "author",
  "share_x",
  "copy_link",
  "copy_install",
]);

export function takesProject(kind: LinkKind): boolean {
  return PROJECT_KINDS.has(kind);
}

/** Links that leave the site for a page the project or its author owns. */
export const OUTGOING_KINDS = ["source", "tweet", "author"] as const satisfies readonly LinkKind[];

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  project_open: "Opened a project",
  source: "Followed a source link",
  tweet: "Followed an announcement link",
  author: "Followed an author link",
  share_x: "Pressed Post on X",
  copy_link: "Pressed Copy link",
  copy_install: "Pressed Copy install command",
  submit: "Pressed Submit a project",
  footer_repo: "Followed the site's repository link",
};

/** A group with fewer clickers than this is not named, so no row can be one person. */
export const MIN_LINK_CLICKERS = 3;

/** Named project and host rows shown in each list; anything past this folds into Other. */
export const MAX_LINK_ROWS = 8;
