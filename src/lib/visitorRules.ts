/**
 * One page load can reach the server as several requests, and production runs several instances, so
 * repeats are dropped here, where every instance shares one view, instead of in each instance's memory.
 */
export const DUPLICATE_WINDOW_MS = 3000;

// An arbitrary constant that only has to be the same on every instance.

/** Where a view came from: a `?ref=` tag we put on our own links, and the site that linked here. */
export interface VisitSource {
  ref: string | null;
  referrerHost: string | null;
}

/** Stored as the referrer host when the view came from a click inside the site. Not a valid hostname, so it can't clash with one. */
export const INTERNAL_SOURCE = "(internal)";
/** Stored when the view had no referrer at all: a typed address, a bookmark, or an app that hides where a link came from. */
export const DIRECT_SOURCE = "(direct)";

const REF_PATTERN = /^[a-z0-9_-]{1,40}$/;
/** Letters, digits, dots, hyphens and underscores. A URL parser accepts more (even "(direct)"), so a client couldn't otherwise be kept from spoofing a marker. */
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9._-]{0,251}[a-z0-9])?$/;
/** Web pages, and Android apps, which send their package name as the referrer. Other schemes say nothing useful about where a visitor came from. */
const REFERRER_PROTOCOLS = new Set(["http:", "https:", "android-app:"]);
const OWN_HOSTS = new Set(["jevusecases.com", "www.jevusecases.com", "localhost"]);

/**
 * Reads the source of a view from the URL and the Referer header. Both come from the client, so only a
 * short ref tag and a bare hostname are kept: never the full referring URL, which can carry personal data.
 * The host is always set, so a click inside the site (internal) can be told from a real arrival (direct).
 * A click from any host this request itself was served on (a preview or alias domain) is internal too.
 */
export function visitSource(url: URL, referer: string | null): VisitSource {
  const rawRef = url.searchParams.get("ref")?.toLowerCase() ?? "";
  let referrerHost = DIRECT_SOURCE;
  if (referer) {
    try {
      const parsed = new URL(referer);
      // "example.com." with a trailing dot is the same host as "example.com".
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (REFERRER_PROTOCOLS.has(parsed.protocol) && HOSTNAME_PATTERN.test(host)) {
        referrerHost = OWN_HOSTS.has(host) || host === url.hostname.toLowerCase().replace(/\.$/, "") ? INTERNAL_SOURCE : host;
      }
    } catch {
      referrerHost = DIRECT_SOURCE;
    }
  }
  return { ref: REF_PATTERN.test(rawRef) ? rawRef : null, referrerHost };
}

/** Automated clients: link-preview builders, search-engine and SEO crawlers, AI crawlers and scripted fetchers. Not people reading. */
const AUTOMATED_CLIENT =
  /bot\b|bot\/|spider|crawl|slurp|facebookexternalhit|whatsapp|telegrambot|embedly|iframely|cardyb|skypeuripreview|mastodon|chatgpt-user|perplexity|siteaudit|quora link preview|headlesschrome|lighthouse|pingdom|uptimerobot|curl\/|wget\/|python-requests|go-http-client|node-fetch|axios\/|okhttp\/|java\/|http\.rb|google-inspectiontool|apis-google|feedfetcher/i;

/** Phone brands whose names end in "bot". Removed before the check so a real Cubot phone isn't taken for a crawler. */
const BOT_LOOKALIKES = /cubot|abbot/gi;

export function isAutomatedClient(userAgent: string | null | undefined): boolean {
  return AUTOMATED_CLIENT.test((userAgent ?? "").replace(BOT_LOOKALIKES, ""));
}
