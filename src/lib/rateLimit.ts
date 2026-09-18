/** An IPv6 subscriber owns a whole /64, so limiting per address would hand them a fresh bucket per request. */
function limitingKey(ip: string): string {
  const address = ip.split("%")[0];
  if (!address.includes(":")) return address;

  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];

  const [head, tail] = address.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return groups
    .slice(0, 4)
    .map((group) => group.padStart(4, "0").toLowerCase())
    .join(":");
}

/**
 * The first entry in x-forwarded-for is whatever the client claimed and is trivially spoofable.
 * The last entry is the one Vercel's own edge appends for the actual connecting peer, so that's
 * the one worth rate-limiting on. IPv6 addresses collapse to their /64.
 */
export function clientIp(source: { headers: { get(name: string): string | null } }): string {
  const chain = source.headers.get("x-forwarded-for")?.split(",");
  const ip = chain?.[chain.length - 1]?.trim();
  return ip ? limitingKey(ip) : "unknown";
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
