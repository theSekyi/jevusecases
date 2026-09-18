import { afterEach, describe, expect, test, vi } from "vitest";
import {
  countryCodeToFlag,
  DUPLICATE_WINDOW_MS,
  countryName,
  getRecentVisitorEvents,
  isValidCountryCode,
  recordVisitorEvent,
  relativeTime,
  VISIBLE_EVENT_COUNT,
} from "../visitorEvents";

const transaction = vi.fn();
const sqlMock = Object.assign(vi.fn(), { transaction });
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

describe("isValidCountryCode", () => {
  test("accepts a plausible two-letter code, rejects everything else", () => {
    expect(isValidCountryCode("US")).toBe(true);
    expect(isValidCountryCode("gb")).toBe(true);
    expect(isValidCountryCode(null)).toBe(false);
    expect(isValidCountryCode(undefined)).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
    expect(isValidCountryCode("USA")).toBe(false);
    expect(isValidCountryCode("<script>alert(1)</script>")).toBe(false);
  });
});

describe("countryName", () => {
  test("resolves a real country code to its display name", () => {
    expect(countryName("US")).toBe("United States");
    expect(countryName("GB")).toBe("United Kingdom");
  });

  test("falls back to a generic label for missing/invalid input, e.g. local dev with no geolocation", () => {
    expect(countryName(null)).toBe("Somewhere");
    expect(countryName("not-a-code")).toBe("Somewhere");
  });
});

describe("relativeTime", () => {
  test("formats seconds and minutes", () => {
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(relativeTime("2026-01-01T00:00:00.000Z", base)).toBe("0s ago");
    expect(relativeTime("2026-01-01T00:00:00.000Z", base + 45_000)).toBe("45s ago");
    expect(relativeTime("2026-01-01T00:00:00.000Z", base + 90_000)).toBe("1m ago");
  });

  test("never goes negative for clock skew between client and server", () => {
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(relativeTime("2026-01-01T00:00:05.000Z", base)).toBe("0s ago");
  });
});

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
    transaction.mockReset();
  });

  test("recordVisitorEvent takes the lock and inserts in one transaction, with the values as parameters", async () => {
    sqlMock.mockReturnValue("query");
    transaction.mockResolvedValueOnce([[], [{ id: 1 }]]);

    const inserted = await recordVisitorEvent("US", "/submit");

    expect(inserted).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(["query", "query"]);
    const [lock, insert] = sqlMock.mock.calls;
    expect(lock[0].join("?")).toContain("pg_advisory_xact_lock");
    expect(insert[0].join("?")).toContain("INSERT INTO visitor_events");
    expect(insert[0].join("?")).toContain("WHERE NOT EXISTS");
    expect(insert.slice(1)).toEqual(["US", "/submit", "US", DUPLICATE_WINDOW_MS]);
  });

  test("recordVisitorEvent reports false when the same country was just recorded", async () => {
    sqlMock.mockReturnValue("query");
    transaction.mockResolvedValueOnce([[], []]);

    expect(await recordVisitorEvent("US", "/")).toBe(false);
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

  test("defaults the query limit to exactly what the live strip displays, not more", async () => {
    sqlMock.mockResolvedValueOnce([]);

    await getRecentVisitorEvents();

    const values = sqlMock.mock.calls[0].slice(1);
    expect(values).toContain(VISIBLE_EVENT_COUNT);
  });
});
