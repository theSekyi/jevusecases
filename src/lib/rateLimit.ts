import type { NextRequest } from "next/server";

/**
 * The first entry in x-forwarded-for is whatever the client claimed and is trivially spoofable.
 * The last entry is the one Vercel's own edge appends for the actual connecting peer, so that's
 * the one worth rate-limiting on.
 */
export function clientIp(request: NextRequest): string {
  const chain = request.headers.get("x-forwarded-for")?.split(",");
  return chain?.[chain.length - 1]?.trim() ?? "unknown";
}

/** Caps how many distinct keys this limiter tracks at once, so a flood of one-off keys can't grow the map forever. */
const MAX_TRACKED_KEYS = 10_000;

/** A per-key sliding-window limiter. In-memory, so it resets on cold start and isn't shared across instances — fine at this site's traffic today; revisit with a shared store (e.g. Upstash Redis) if that stops being true. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return function check(key: string): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }

    recent.push(now);
    if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) {
      const oldestKey = hits.keys().next().value;
      if (oldestKey !== undefined) hits.delete(oldestKey);
    }
    hits.set(key, recent);
    return true;
  };
}
