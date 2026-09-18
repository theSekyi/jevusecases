import { db } from "./db.ts";
import { generateTemporaryPassword, hashPassword, verifyAgainstDummy, verifyPassword } from "./password.ts";

/** What the rest of the app is allowed to know about an admin — never the password hash. */
export interface AdminUser {
  id: string;
  email: string;
  usingTempPassword: boolean;
}

/** Returned once, at login, so the session can be tied to the exact credentials that were verified. */
export interface AuthenticatedAdmin extends AdminUser {
  credentialVersion: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  using_temp_password: boolean;
  credential_version: string;
}

async function findByEmail(email: string): Promise<UserRow | undefined> {
  const sql = db();
  const rows = (await sql`
    SELECT id, email, password_hash, using_temp_password, credential_version
    FROM admin_users WHERE email = ${normalizeEmail(email)}
  `) as UserRow[];
  return rows[0];
}

/** Creates an account with a random temporary password, returned once. Null if the email already has an account. */
export async function createInvitedUser(
  email: string,
): Promise<{ email: string; temporaryPassword: string } | null> {
  const sql = db();
  const normalized = normalizeEmail(email);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const rows = (await sql`
    INSERT INTO admin_users (email, password_hash, using_temp_password)
    VALUES (${normalized}, ${passwordHash}, true)
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `) as { id: string }[];

  return rows.length > 0 ? { email: normalized, temporaryPassword } : null;
}

/** Gives an existing account a fresh temporary password and signs it out everywhere. Null if there's no such account. */
export async function resetToTemporaryPassword(
  email: string,
): Promise<{ email: string; temporaryPassword: string } | null> {
  const sql = db();
  const normalized = normalizeEmail(email);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  // One statement, so the new password and the session revocation can't be separated.
  const rows = (await sql`
    WITH updated AS (
      UPDATE admin_users
      SET password_hash = ${passwordHash}, using_temp_password = true, credential_version = credential_version + 1
      WHERE email = ${normalized}
      RETURNING id
    ),
    revoked AS (DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM updated))
    SELECT id FROM updated
  `) as { id: string }[];

  return rows.length > 0 ? { email: normalized, temporaryPassword } : null;
}

/** Deletes an account and, with it, every session it has. False if there was no such account. */
export async function removeUser(email: string): Promise<boolean> {
  const sql = db();
  const rows = (await sql`DELETE FROM admin_users WHERE email = ${normalizeEmail(email)} RETURNING id`) as {
    id: string;
  }[];
  return rows.length > 0;
}

/** An unknown email costs the same time as a wrong password. */
export async function authenticate(email: string, password: string): Promise<AuthenticatedAdmin | null> {
  const user = await findByEmail(email);
  if (!user) {
    await verifyAgainstDummy(password);
    return null;
  }
  if (!(await verifyPassword(password, user.password_hash))) return null;
  return {
    id: user.id,
    email: user.email,
    usingTempPassword: user.using_temp_password,
    credentialVersion: user.credential_version,
  };
}

export type ChangePasswordResult = "ok" | "wrong_password" | "not_found" | "conflict";

/**
 * Replaces the password (temporary or not) and signs the account out everywhere, this session
 * included. "conflict" means the credentials changed while this was being checked: a reset or
 * another change won, and this one is discarded rather than overwriting it.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const sql = db();
  const rows = (await sql`SELECT password_hash, credential_version FROM admin_users WHERE id = ${userId}`) as {
    password_hash: string;
    credential_version: string;
  }[];
  const current = rows[0];
  if (!current) return "not_found";
  if (!(await verifyPassword(currentPassword, current.password_hash))) return "wrong_password";

  const passwordHash = await hashPassword(newPassword);
  const updated = (await sql`
    WITH updated AS (
      UPDATE admin_users
      SET password_hash = ${passwordHash}, using_temp_password = false, credential_version = credential_version + 1
      WHERE id = ${userId} AND credential_version = ${current.credential_version}
      RETURNING id
    ),
    revoked AS (DELETE FROM admin_sessions WHERE user_id = ${userId} AND EXISTS (SELECT 1 FROM updated))
    SELECT id FROM updated
  `) as { id: string }[];

  return updated.length > 0 ? "ok" : "conflict";
}
