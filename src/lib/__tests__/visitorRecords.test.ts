import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { clientIp } from "../rateLimit";
import { deleteVisitorRecords, lookupVisitorRecords, visitorHashForIp } from "../visitorRecords";
import { hashVisitor } from "../visitorHash";

describe("visitorHashForIp", () => {
  beforeEach(() => {
    vi.stubEnv("VISITOR_HASH_SECRET", "s".repeat(32));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("gives the hash the proxy would have stored for a request from that IP", () => {
    const request = new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": "203.0.113.5" } });

    expect(visitorHashForIp("203.0.113.5")).toBe(hashVisitor(clientIp(request)));
  });

  test("a full IPv6 address gives the same hash as anything else in its /64, as the proxy does", () => {
    const stored = hashVisitor(
      clientIp(new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" } })),
    );

    expect(visitorHashForIp("2001:db8:1:2:1111:2222:3333:4444")).toBe(stored);
    expect(visitorHashForIp("2001:0DB8:0001:0002::1")).toBe(stored);
    expect(visitorHashForIp("2001:db8:1:3::1")).not.toBe(stored);
  });

  test("ignores surrounding spaces", () => {
    expect(visitorHashForIp("  203.0.113.5 ")).toBe(visitorHashForIp("203.0.113.5"));
  });

  test("rejects anything that isn't an IP address", () => {
    expect(visitorHashForIp("")).toBeNull();
    expect(visitorHashForIp("someone@example.com")).toBeNull();
    expect(visitorHashForIp("not an ip")).toBeNull();
    expect(visitorHashForIp("12345")).toBeNull();
  });

  test("gives nothing without a usable secret", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(visitorHashForIp("203.0.113.5")).toBeNull();
  });
});

describe("lookupVisitorRecords / deleteVisitorRecords", () => {
  const sqlMock = vi.fn();
  const sql = sqlMock as unknown as Parameters<typeof lookupVisitorRecords>[0];

  afterEach(() => {
    sqlMock.mockReset();
  });

  test("lookup reads only that hash and returns counts and dates, never the hash", async () => {
    sqlMock.mockResolvedValueOnce([{ views: 3, first_seen: "2026-09-18T10:00:00Z", last_seen: "2026-09-19T10:00:00Z", countries: ["GB"] }]);

    const records = await lookupVisitorRecords(sql, "abc123");

    expect(records).toEqual({ views: 3, firstSeen: "2026-09-18T10:00:00Z", lastSeen: "2026-09-19T10:00:00Z", countries: ["GB"] });
    const [strings, ...values] = sqlMock.mock.calls[0];
    expect(strings.join("?")).toContain("WHERE visitor_hash = ");
    expect(values).toEqual(["abc123"]);
    expect(JSON.stringify(records)).not.toContain("abc123");
  });

  test("delete removes only rows for that hash and returns how many", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    expect(await deleteVisitorRecords(sql, "abc123")).toBe(2);
    const [strings, ...values] = sqlMock.mock.calls[0];
    expect(strings.join("?")).toContain("DELETE FROM visitor_events WHERE visitor_hash = ");
    expect(values).toEqual(["abc123"]);
  });
});
