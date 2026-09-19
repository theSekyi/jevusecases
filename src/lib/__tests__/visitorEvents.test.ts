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
  DIRECT_SOURCE,
  INTERNAL_SOURCE,
  isAutomatedClient,
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
    expect(visitSource(url("?ref=X-Post-1"), null)).toEqual({ ref: "x-post-1", referrerHost: DIRECT_SOURCE });
  });

  test("drops a ref tag that is too long or has other characters", () => {
    expect(visitSource(url(`?ref=${"a".repeat(41)}`), null).ref).toBeNull();
    expect(visitSource(url("?ref=<script>"), null).ref).toBeNull();
    expect(visitSource(url("?ref=a%20b"), null).ref).toBeNull();
  });

  test("keeps only the host of the referrer, never its path or query", () => {
    expect(visitSource(url(), "https://t.co/AbC123?amp=1").referrerHost).toBe("t.co");
    expect(visitSource(url(), "https://Mail.Example.com:8443/inbox/secret-id?token=abc#frag").referrerHost).toBe("mail.example.com");
  });

  test("marks a click from our own site as internal, so it can't be mistaken for an arrival", () => {
    expect(visitSource(url(), "https://www.jevusecases.com/").referrerHost).toBe(INTERNAL_SOURCE);
    expect(visitSource(url(), "https://jevusecases.com/p/x").referrerHost).toBe(INTERNAL_SOURCE);
    expect(visitSource(url(), "http://localhost:3000/").referrerHost).toBe(INTERNAL_SOURCE);
  });

  test("marks no referrer, and a malformed one, as direct", () => {
    expect(visitSource(url(), null).referrerHost).toBe(DIRECT_SOURCE);
    expect(visitSource(url(), "").referrerHost).toBe(DIRECT_SOURCE);
    expect(visitSource(url(), "not a url").referrerHost).toBe(DIRECT_SOURCE);
  });

  test("a crafted Referer can't pose as one of the markers, or as anything that isn't a hostname", () => {
    for (const referer of ["https://(internal)/", "https://(direct)/", "https://[::1]/", "https://exa$mple.com/", "https://-bad.com/"]) {
      expect(visitSource(url(), referer).referrerHost, referer).toBe(DIRECT_SOURCE);
    }
    expect(visitSource(url(), "https://1.2.3.4/x").referrerHost).toBe("1.2.3.4");
    expect(visitSource(url(), "https://xn--bcher-kva.example/").referrerHost).toBe("xn--bcher-kva.example");
  });

  test("a lookalike of our own domain is a real external site, not internal", () => {
    expect(visitSource(url(), "https://jevusecases.com.evil.example/").referrerHost).toBe("jevusecases.com.evil.example");
    expect(visitSource(url(), "https://notjevusecases.com/").referrerHost).toBe("notjevusecases.com");
  });

  test("drops an absurdly long hostname instead of storing it", () => {
    expect(visitSource(url(), `https://${"a".repeat(300)}.com/`).referrerHost).toBe(DIRECT_SOURCE);
  });
});

describe("isAutomatedClient", () => {
  test("recognises link-preview builders, search-engine crawlers, SEO and AI crawlers, and scripts", () => {
    for (const agent of [
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0 A",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
      "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
      "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Go-http-client/2.0",
    ]) {
      expect(isAutomatedClient(agent), agent).toBe(true);
    }
  });

  test("leaves real browsers alone, on every platform", () => {
    for (const agent of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
      "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0",
    ]) {
      expect(isAutomatedClient(agent), agent).toBe(false);
    }
  });

  test("treats a missing user agent as a person, since real requests can lack one", () => {
    expect(isAutomatedClient(null)).toBe(false);
    expect(isAutomatedClient(undefined)).toBe(false);
    expect(isAutomatedClient("")).toBe(false);
  });
});
