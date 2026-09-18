import { afterEach, describe, expect, test, vi } from "vitest";
import { hashVisitor } from "../visitorHash";

describe("hashVisitor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("gives the same value for the same IP, on any day", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "secret-one");

    expect(hashVisitor("203.0.113.5")).toBe(hashVisitor("203.0.113.5"));
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(hashVisitor("203.0.113.5")).toBe(hashVisitor("203.0.113.5"));
    vi.useRealTimers();
  });

  test("gives different values for different IPs", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "secret-one");

    expect(hashVisitor("203.0.113.5")).not.toBe(hashVisitor("203.0.113.6"));
  });

  test("a different secret gives different values, so hashes can't be matched to IPs without it", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "secret-one");
    const first = hashVisitor("203.0.113.5");
    vi.stubEnv("VISITOR_HASH_SECRET", "secret-two");

    expect(hashVisitor("203.0.113.5")).not.toBe(first);
  });

  test("is 32 hex characters and never contains the IP", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "secret-one");
    const hash = hashVisitor("203.0.113.5");

    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("203");
  });

  test("gives no identity without a secret, rather than a hash anyone could reproduce", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "");

    expect(hashVisitor("203.0.113.5")).toBeNull();
  });

  test("gives no identity when the IP is unknown, so all unknown clients aren't merged into one visitor", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "secret-one");

    expect(hashVisitor("unknown")).toBeNull();
  });
});
