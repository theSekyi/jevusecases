/** The canonical origin. The bare domain redirects here, so links and share cards use it directly. */
export const SITE_URL = "https://www.jevusecases.com";

/** The shareable address of one project: a real page, so X and Slack can read its preview card. */
export function projectUrl(id: string, ref?: string): string {
  return `${SITE_URL}/p/${encodeURIComponent(id)}${ref ? `?ref=${ref}` : ""}`;
}
