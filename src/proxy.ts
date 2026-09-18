import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";
import { recordVisitorEvent } from "@/lib/visitorEvents";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

// A generous per-IP cap, just to blunt a scripted flood rather than to limit real traffic.
const checkRateLimit = createRateLimiter(60, 60 * 1000);

async function recordVisit(request: NextRequest) {
  if (!checkRateLimit(clientIp(request))) return;

  const { country } = geolocation(request);
  try {
    await recordVisitorEvent(country ?? null, request.nextUrl.pathname);
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
    "/((?!api|admin|_next/static|_next/image|favicon.ico|apple-icon|icon|sitemap.xml|robots.txt).*)",
  ],
};
