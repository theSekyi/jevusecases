import { createHmac } from "node:crypto";

/**
 * A stable, pseudonymous ID for one client IP: the same IP always gives the same value, so returning
 * visitors can be counted, but the IP itself is never stored. Keyed with a secret so nobody holding a
 * copy of the database can turn a hash back into an IP by hashing guesses. Returns null when there is
 * no secret or no usable IP, so recording still works, just without an identity.
 */
export function hashVisitor(ip: string): string | null {
  const secret = process.env.VISITOR_HASH_SECRET;
  if (!secret || ip === "unknown") return null;
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
