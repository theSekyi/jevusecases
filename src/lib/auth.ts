import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionUser,
  isSessionToken,
} from "@/lib/adminSessions";
import type { AdminUser } from "@/lib/adminUsers";

import { LOGIN_PATH, SESSION_COOKIE } from "@/lib/authConstants";

export { ADMIN_PATH, LOGIN_PATH, SESSION_COOKIE } from "@/lib/authConstants";

/**
 * Signs the user in: a random session token goes in the cookie, only its hash goes in the database.
 * Returns false when the account's credentials changed since they were verified (nothing is created).
 */
export async function startSession(userId: string, credentialVersion: string): Promise<boolean> {
  const cookieStore = await cookies();

  // A session already sitting behind this browser's cookie is replaced, not left valid for a week.
  const previous = cookieStore.get(SESSION_COOKIE)?.value;
  if (previous && isSessionToken(previous)) {
    await deleteSessionRecord(previous).catch(() => {});
  }

  const session = await createSessionRecord(userId, credentialVersion);
  if (!session) return false;

  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return true;
}

/** The cookie goes first, so signing out works even if the database is unreachable. */
export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.delete(SESSION_COOKIE);

  if (token && isSessionToken(token)) {
    try {
      await deleteSessionRecord(token);
    } catch (error) {
      console.error("Failed to delete the admin session row:", error);
    }
  }
}

/** The signed-in admin for this request, or null. One database lookup per request. */
export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !isSessionToken(token)) return null;
  return findSessionUser(token);
});

/** Call at the top of every admin page and every admin Server Action — layouts don't re-run on navigation. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect(LOGIN_PATH);
  return admin;
}
