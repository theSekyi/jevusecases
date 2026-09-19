import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";
import { isAutomatedClient, isValidCountryCode, recordVisitorEvent, visitSource } from "@/lib/visitorEvents";
import { SESSION_COOKIE } from "@/lib/authConstants";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import { hashVisitor } from "@/lib/visitorHash";

// A generous per-IP cap, just to blunt a scripted flood rather than to limit real traffic.
const checkRateLimit = createRateLimiter(60, 60 * 1000);

async function recordVisit(request: NextRequest) {
  try {
    // Only a real navigation is a page view — not a HEAD/OPTIONS probe, and not a prefetch:
    // the App Router speculatively prefetches every link that scrolls into view, which would
    // otherwise inflate the feed with pages nobody actually read.
    if (request.method !== "GET") return;
    if (request.headers.get("next-router-prefetch")) return;
    if (request.headers.get("purpose") === "prefetch") return;
    if (request.headers.get("sec-purpose")?.includes("prefetch")) return;
    // Crawlers and link-preview builders fetch pages too. Counting them would credit every post, and every
    // search engine visit, with a view nobody read.
    if (isAutomatedClient(request.headers.get("user-agent"))) return;
    // The admin's own browsing would otherwise dominate the feed. Presence of the cookie is
    // enough here; nothing is being authorized.
    if (request.cookies.has(SESSION_COOKIE)) return;
    const ip = clientIp(request);
    if (!checkRateLimit(ip)) return;

    const { country } = geolocation(request);
    await recordVisitorEvent(
      isValidCountryCode(country) ? country : null,
      request.nextUrl.pathname,
      hashVisitor(ip),
      visitSource(request.nextUrl, request.headers.get("referer")),
    );
  } catch (error) {
    console.error("Failed to record visitor event:", error);
  }
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(recordVisit(request));
  return NextResponse.next();
}

// Files (anything whose last segment has an extension) and /.well-known/ aren't pages. If a route
// with a dot in its last segment is ever added, this rule has to be narrowed or it goes unrecorded.
export const config = {
  matcher: [
    "/((?!api(?:/|$)|admin(?:/|$)|_next/static|_next/image|\\.well-known/|.*\\.[^/]+$|apple-icon$|icon$|(?:.*/)?opengraph-image$).*)",
  ],
};
