import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";
import { isValidCountryCode, recordVisitorEvent } from "@/lib/visitorEvents";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

// A generous per-IP cap, just to blunt a scripted flood rather than to limit real traffic.
const checkRateLimit = createRateLimiter(60, 60 * 1000);

// The App Router issues its own internal RSC re-fetches of the current route right after the
// initial load (Next.js strips the headers that would otherwise identify these to Proxy, so
// header-based filtering alone can't catch them) — this collapses that burst into one event per
// visit instead of enumerating every internal request shape, which would be fragile across
// framework versions. A real second page view from the same visitor a second apart still counts.
const checkNotDuplicate = createRateLimiter(1, 1500);

async function recordVisit(request: NextRequest) {
  try {
    // Only a real navigation is a page view — not a HEAD/OPTIONS probe, and not a prefetch:
    // the App Router speculatively prefetches every link that scrolls into view, which would
    // otherwise inflate the feed with pages nobody actually read.
    if (request.method !== "GET") return;
    if (request.headers.get("next-router-prefetch")) return;
    if (request.headers.get("purpose") === "prefetch") return;
    const ip = clientIp(request);
    if (!checkRateLimit(ip)) return;
    if (!checkNotDuplicate(ip)) return;

    const { country } = geolocation(request);
    await recordVisitorEvent(isValidCountryCode(country) ? country : null, request.nextUrl.pathname);
  } catch (error) {
    console.error("Failed to record visitor event:", error);
  }
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(recordVisit(request));
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|admin(?:/|$)|_next/static|_next/image|favicon\\.ico$|apple-icon$|icon$|sitemap\\.xml$|robots\\.txt$).*)",
  ],
};
