import { afterEach, describe, expect, test, vi } from "vitest";
import {
  countryCodeToFlag,
  countryName,
  DUPLICATE_WINDOW_MS,
  getRecentVisitorEvents,
  isValidCountryCode,
  recordVisitorEvent,
  relativeTime,
  VISIBLE_EVENT_COUNT,
  visitSource,
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

  test("recordVisitorEvent sets a lock timeout, takes the lock and inserts in one transaction, with the values as parameters", async () => {
    sqlMock.mockReturnValue("query");
    transaction.mockResolvedValueOnce([]);

    await recordVisitorEvent("US", "/submit", "abc123");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(["query", "query", "query"]);
    const [timeout, lock, insert] = sqlMock.mock.calls;
    expect(timeout[0].join("?")).toContain("SET LOCAL lock_timeout");
    expect(lock[0].join("?")).toContain("pg_advisory_xact_lock");
    expect(insert[0].join("?")).toContain("INSERT INTO visitor_events (country, path, visitor_hash, ref, referrer_host)");
    expect(insert[0].join("?")).toContain("WHERE NOT EXISTS");
    expect(insert.slice(1)).toEqual(["US", "/submit", "abc123", null, null, DUPLICATE_WINDOW_MS, "abc123", "abc123", "abc123", "US"]);
  });

  test("with a visitor hash, repeats are matched on the hash, so two visitors from one country both count", async () => {
    sqlMock.mockReturnValue("query");
    transaction.mockResolvedValueOnce([]);

    await recordVisitorEvent("US", "/", "abc123");

    const statement = sqlMock.mock.calls[2][0].join("?");
    expect(statement).toContain("visitor_hash = ");
  });

  test("without a visitor hash it falls back to matching unidentified rows from the same country, null-safe", async () => {
    sqlMock.mockReturnValue("query");
    transaction.mockResolvedValueOnce([]);

    await recordVisitorEvent(null, "/");

    const insert = sqlMock.mock.calls[2];
    expect(insert[0].join("?")).toContain("visitor_hash IS NULL AND country IS NOT DISTINCT FROM");
    expect(insert.slice(1)).toEqual([null, "/", null, null, null, DUPLICATE_WINDOW_MS, null, null, null, null]);
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

describe("visitSource", () => {
  const url = (query = "") => new URL(`https://www.jevusecases.com/p/jev-guard${query}`);

  test("keeps a short ref tag, lowercased", () => {
    expect(visitSource(url("?ref=X-Post-1"), null)).toEqual({ ref: "x-post-1", referrerHost: null });
  });

  test("drops a ref tag that is too long or has other characters", () => {
    expect(visitSource(url(`?ref=${"a".repeat(41)}`), null).ref).toBeNull();
    expect(visitSource(url("?ref=<script>"), null).ref).toBeNull();
    expect(visitSource(url("?ref=a%20b"), null).ref).toBeNull();
  });

  test("keeps only the host of the referrer, never its path or query", () => {
    expect(visitSource(url(), "https://t.co/AbC123?amp=1").referrerHost).toBe("t.co");
  });

  test("ignores our own site and malformed referrers", () => {
    expect(visitSource(url(), "https://www.jevusecases.com/").referrerHost).toBeNull();
    expect(visitSource(url(), "not a url").referrerHost).toBeNull();
  });
});
