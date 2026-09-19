import { NextResponse, type NextRequest } from "next/server";
import { getRecentVisitorEvents } from "@/lib/visitorEvents";
import { countryCodeToFlag } from "@/lib/visitorFormat";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

// Well above the strip's own 7s poll cadence — this only needs to blunt a scripted flood.
const checkRateLimit = createRateLimiter(30, 60 * 1000);

export async function GET(request: NextRequest) {
  if (!checkRateLimit(clientIp(request))) {
    return NextResponse.json({ events: [] }, { status: 429 });
  }

  try {
    const events = await getRecentVisitorEvents();
    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        country: event.country,
        flag: countryCodeToFlag(event.country),
        path: event.path,
        createdAt: event.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to load visitor events:", error);
    return NextResponse.json({ events: [] }, { status: 502 });
  }
}
