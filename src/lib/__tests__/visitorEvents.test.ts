import { afterEach, describe, expect, test, vi } from "vitest";
import { countryCodeToFlag, getRecentVisitorEvents, recordVisitorEvent } from "../visitorEvents";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

describe("countryCodeToFlag", () => {
  test("turns a country code into its flag emoji", () => {
    expect(countryCodeToFlag("US")).toBe("🇺🇸");
    expect(countryCodeToFlag("gb")).toBe("🇬🇧");
    expect(countryCodeToFlag("JP")).toBe("🇯🇵");
  });

  test("returns null for null, empty, or malformed input", () => {
    expect(countryCodeToFlag(null)).toBeNull();
    expect(countryCodeToFlag("")).toBeNull();
    expect(countryCodeToFlag("USA")).toBeNull();
    expect(countryCodeToFlag("1A")).toBeNull();
    expect(countryCodeToFlag("<script>")).toBeNull();
  });
});

describe("recordVisitorEvent / getRecentVisitorEvents", () => {
  afterEach(() => {
    sqlMock.mockReset();
  });

  test("recordVisitorEvent inserts the country and path via a parameterized query", async () => {
    sqlMock.mockResolvedValueOnce([]);

    await recordVisitorEvent("US", "/submit");

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const [strings, ...values] = sqlMock.mock.calls[0];
    expect(strings.join("?")).toContain("INSERT INTO visitor_events");
    expect(values).toEqual(["US", "/submit"]);
  });

  test("getRecentVisitorEvents maps snake_case rows into the VisitorEvent shape", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 2, country: "US", path: "/", created_at: "2026-01-01T00:00:01.000Z" },
      { id: 1, country: null, path: "/submit", created_at: "2026-01-01T00:00:00.000Z" },
    ]);

    const events = await getRecentVisitorEvents();

    expect(events).toEqual([
      { id: 2, country: "US", path: "/", createdAt: "2026-01-01T00:00:01.000Z" },
      { id: 1, country: null, path: "/submit", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});
