import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt at OWASP's "N=2^15, r=8, p=3" setting (~32 MiB per hash). The parameters are stored with
// each hash, so they can be raised later without invalidating existing passwords.
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 128 * 1024 * 1024;

// Ceilings for parameters read back from storage, so a corrupted row can't request unbounded work.
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Hashes a password into a self-describing string: scrypt$N$r$p$salt$hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

/** Constant-time check of a password against a stored hash. A malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;

  const cost = Number(n);
  const blockSize = Number(r);
  const parallelism = Number(p);
  const saltBytes = Buffer.from(salt, "base64");
  const expected = Buffer.from(hash, "base64");
  const withinBounds =
    Number.isInteger(cost) && cost > 1 && cost <= MAX_N &&
    Number.isInteger(blockSize) && blockSize > 0 && blockSize <= MAX_R &&
    Number.isInteger(parallelism) && parallelism > 0 && parallelism <= MAX_P;
  if (!withinBounds || saltBytes.length === 0 || expected.length === 0) return false;

  try {
    const actual = await derive(password, saltBytes, cost, blockSize, parallelism, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Does the same work as a real check, so an unknown email can't be told apart from a wrong password by response time. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  await derive(password, Buffer.alloc(SALT_BYTES), N, R, P, KEY_LENGTH);
}

/** A 20-character random password (120 bits) for a freshly invited account. */
export function generateTemporaryPassword(): string {
  return randomBytes(15).toString("base64url");
}
