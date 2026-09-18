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
    hits.set(key, recent);
    return true;
  };
}
