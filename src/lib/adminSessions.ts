// Relative imports with explicit extensions (here and in adminUsers.ts / password.ts): scripts/invite.ts
// runs under plain Node, which can't resolve the "@/" alias.
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db.ts";
import type { AdminUser } from "./adminUsers.ts";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Cheap shape check, so a junk cookie never costs a database lookup. */
export function isSessionToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** Only this hash is stored, so a leaked database can't be replayed as a live session cookie. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a session only if the account's credentials are still the ones that were just verified.
 * A password change or reset that lands while a login is being checked bumps the version, so that
 * login can't slip a session in after the reset already revoked everything. Null means it lost the race.
 */
export async function createSessionRecord(
  userId: string,
  credentialVersion: string,
): Promise<{ token: string; expiresAt: Date } | null> {
  const sql = db();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const rows = (await sql`
    WITH expired AS (DELETE FROM admin_sessions WHERE expires_at < now())
    INSERT INTO admin_sessions (token_hash, user_id, expires_at)
    SELECT ${hashToken(token)}, u.id, ${expiresAt.toISOString()}
    FROM admin_users u
    WHERE u.id = ${userId} AND u.credential_version = ${credentialVersion}
    RETURNING token_hash
  `) as { token_hash: string }[];

  return rows.length > 0 ? { token, expiresAt } : null;
}

export async function findSessionUser(token: string): Promise<AdminUser | null> {
  const sql = db();
  const rows = (await sql`
    SELECT u.id, u.email, u.using_temp_password
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()
  `) as { id: string; email: string; using_temp_password: boolean }[];

  const row = rows[0];
  return row ? { id: row.id, email: row.email, usingTempPassword: row.using_temp_password } : null;
}

export async function deleteSessionRecord(token: string): Promise<void> {
  const sql = db();
  await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(token)}`;
}
