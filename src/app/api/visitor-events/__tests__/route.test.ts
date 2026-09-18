import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const getRecentVisitorEvents = vi.fn();
vi.mock("@/lib/visitorEvents", async () => {
  const actual = await vi.importActual<typeof import("@/lib/visitorEvents")>("@/lib/visitorEvents");
  return { ...actual, getRecentVisitorEvents: (...args: unknown[]) => getRecentVisitorEvents(...args) };
});

function getRequest(ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/visitor-events", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/visitor-events", () => {
  beforeEach(() => {
    vi.resetModules();
    getRecentVisitorEvents.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns recent events with a flag computed per event", async () => {
    getRecentVisitorEvents.mockResolvedValueOnce([
      { id: 1, country: "US", path: "/", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: 2, country: null, path: "/submit", createdAt: "2026-01-01T00:00:01.000Z" },
    ]);
    const { GET } = await import("../route");

    const response = await GET(getRequest("10.0.0.1"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.events).toEqual([
      { id: 1, country: "US", flag: "🇺🇸", path: "/", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: 2, country: null, flag: null, path: "/submit", createdAt: "2026-01-01T00:00:01.000Z" },
    ]);
  });

  test("returns an empty list with a 502 when the database call fails, instead of throwing", async () => {
    getRecentVisitorEvents.mockRejectedValueOnce(new Error("connection reset"));
    const { GET } = await import("../route");

    const response = await GET(getRequest("10.0.0.2"));

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.events).toEqual([]);
  });

  test("rate-limits repeated polling from the same IP", async () => {
    getRecentVisitorEvents.mockResolvedValue([]);
    const { GET } = await import("../route");
    const ip = "10.0.0.3";

    for (let i = 0; i < 30; i++) {
      const response = await GET(getRequest(ip));
      expect(response.status).toBe(200);
    }

    const response = await GET(getRequest(ip));
    expect(response.status).toBe(429);
  });
});
