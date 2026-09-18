import { createHmac } from "node:crypto";

/** Short secrets can be brute-forced together with the IPv4 space, so anything under this is treated as unset. */
const MIN_SECRET_LENGTH = 32;

let warned = false;

function readSecret(): string | null {
  const secret = process.env.VISITOR_HASH_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (!warned) {
    warned = true;
    console.warn(`VISITOR_HASH_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters; visitors are not being identified.`);
  }
  return null;
}

/**
 * A stable, pseudonymous ID for one client IP: the same IP always gives the same value, so returning
 * visitors can be counted, but the IP itself is never stored. Keyed with a secret so nobody holding a
 * copy of the database can turn a hash back into an IP by hashing guesses. Returns null when there is
 * no usable secret or no usable IP, so recording still works, just without an identity.
 */
export function hashVisitor(ip: string): string | null {
  if (ip === "unknown") return null;
  const secret = readSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
