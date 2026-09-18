import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRateLimiter } from "../rateLimit";

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
});
