import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getRecentVisitorEvents = vi.fn();
vi.mock("@/lib/visitorEvents", async () => {
  const actual = await vi.importActual<typeof import("@/lib/visitorEvents")>("@/lib/visitorEvents");
  return { ...actual, getRecentVisitorEvents: (...args: unknown[]) => getRecentVisitorEvents(...args) };
});

describe("GET /api/visitor-events", () => {
  beforeEach(() => {
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

    const response = await GET();

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

    const response = await GET();

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.events).toEqual([]);
  });
});
