import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hashVisitor } from "../visitorHash";

const SECRET = "s".repeat(32);

describe("hashVisitor", () => {
  beforeEach(() => {
    vi.stubEnv("VISITOR_HASH_SECRET", SECRET);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("gives the same value for the same IP every time", () => {
    expect(hashVisitor("203.0.113.5")).toBe(hashVisitor("203.0.113.5"));
  });

  test("gives different values for different IPs", () => {
    expect(hashVisitor("203.0.113.5")).not.toBe(hashVisitor("203.0.113.6"));
  });

  test("a different secret gives different values, so hashes can't be matched to IPs without it", () => {
    const first = hashVisitor("203.0.113.5");
    vi.stubEnv("VISITOR_HASH_SECRET", "t".repeat(32));

    expect(hashVisitor("203.0.113.5")).not.toBe(first);
  });

  test("is 32 hex characters", () => {
    expect(hashVisitor("203.0.113.5")).toMatch(/^[0-9a-f]{32}$/);
  });

  test("gives no identity without a secret, rather than a hash anyone could reproduce", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "");

    expect(hashVisitor("203.0.113.5")).toBeNull();
  });

  test("gives no identity for a secret too short to resist guessing", () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "short");

    expect(hashVisitor("203.0.113.5")).toBeNull();
  });

  test("warns about a missing or short secret, once", async () => {
    vi.resetModules();
    const { hashVisitor: fresh } = await import("../visitorHash");
    vi.stubEnv("VISITOR_HASH_SECRET", "");

    fresh("203.0.113.5");
    fresh("203.0.113.6");

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  test("gives no identity when the IP is unknown, so all unknown clients aren't merged into one visitor", () => {
    expect(hashVisitor("unknown")).toBeNull();
  });
});
