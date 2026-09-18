import { NextResponse } from "next/server";
import { countryCodeToFlag, getRecentVisitorEvents } from "@/lib/visitorEvents";

export async function GET() {
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
