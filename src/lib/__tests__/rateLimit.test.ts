import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clientIp, createRateLimiter } from "../rateLimit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("allows requests up to the limit, then blocks", () => {
    const check = createRateLimiter(3, 1000);

    expect(check("1.2.3.4")).toBe(true);
    expect(check("1.2.3.4")).toBe(true);
    expect(check("1.2.3.4")).toBe(true);
    expect(check("1.2.3.4")).toBe(false);
  });

  test("tracks each key independently", () => {
    const check = createRateLimiter(1, 1000);

    expect(check("1.2.3.4")).toBe(true);
    expect(check("5.6.7.8")).toBe(true);
    expect(check("1.2.3.4")).toBe(false);
  });

  test("allows requests again once the window passes", () => {
    const check = createRateLimiter(1, 1000);

    expect(check("1.2.3.4")).toBe(true);
    expect(check("1.2.3.4")).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(check("1.2.3.4")).toBe(true);
  });

  test("bounds total tracked keys instead of growing forever as new keys show up", () => {
    const check = createRateLimiter(1, 60 * 60 * 1000);

    check("key-0");
    expect(check("key-0")).toBe(false); // exhausted, still within the window

    for (let i = 1; i < 10_050; i++) {
      check(`key-${i}`);
    }

    // Evicted as the oldest tracked key once the cap was exceeded, so it's treated as fresh again.
    expect(check("key-0")).toBe(true);
  });
});

describe("clientIp", () => {
  const request = (forwardedFor?: string) => ({
    headers: new Headers(forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor }),
  });

  test("trusts only the last hop, which the platform appends", () => {
    expect(clientIp(request("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
  });

  test("falls back to one shared bucket when there is no header", () => {
    expect(clientIp(request())).toBe("unknown");
    expect(clientIp(request(""))).toBe("unknown");
  });

  test("treats every address in one IPv6 /64 as the same source", () => {
    const a = clientIp(request("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
    const b = clientIp(request("2001:db8:1:2:1111:2222:3333:4444"));
    const other = clientIp(request("2001:db8:1:3:aaaa:bbbb:cccc:dddd"));

    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  test("groups compressed IPv6 addresses by their /64 too", () => {
    expect(clientIp(request("2001:db8::1"))).toBe(clientIp(request("2001:db8::ffff")));
    expect(clientIp(request("2001:db8::1"))).not.toBe(clientIp(request("2001:db9::1")));
  });

  test("ignores an IPv6 zone id", () => {
    expect(clientIp(request("fe80::1%eth0"))).toBe(clientIp(request("fe80::2")));
  });

  test("leaves IPv4 alone, including IPv4-mapped IPv6 addresses", () => {
    expect(clientIp(request("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(request("::ffff:203.0.113.9"))).toBe("203.0.113.9");
  });
});
