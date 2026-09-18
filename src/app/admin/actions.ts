"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, changePassword as changeAdminPassword } from "@/lib/adminUsers";
import { ADMIN_PATH, endSession, LOGIN_PATH, requireAdmin, startSession } from "@/lib/auth";
import { allowLoginAttempt, allowPasswordChangeAttempt } from "@/lib/authRateLimit";
import { changePasswordSchema, firstFieldErrors, loginSchema, type AuthFormState } from "@/lib/authSchema";
import { clientIp } from "@/lib/rateLimit";

const TOO_MANY = "Too many attempts. Try again in a few minutes.";
const GENERIC_FAILURE = "Something went wrong. Try again.";

export async function login(_previous: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const rawEmail = formData.get("email");
  const parsed = loginSchema.safeParse({ email: rawEmail, password: formData.get("password") });
  if (!parsed.success) {
    return { error: "Enter your email and password.", email: typeof rawEmail === "string" ? rawEmail : "" };
  }
  const { email, password } = parsed.data;

  if (!allowLoginAttempt(clientIp({ headers: await headers() }), email)) {
    return { error: TOO_MANY, email };
  }

  let signedIn = false;
  try {
    const admin = await authenticate(email, password);
    if (!admin) return { error: "Invalid email or password.", email };
    signedIn = await startSession(admin.id, admin.credentialVersion);
  } catch (error) {
    console.error("Admin login failed:", error);
    return { error: GENERIC_FAILURE, email };
  }
  if (!signedIn) return { error: GENERIC_FAILURE, email };

  redirect(ADMIN_PATH);
}

export async function logout(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}

export async function changePassword(
  _previous: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const admin = await requireAdmin();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: firstFieldErrors(parsed.error) };

  if (!allowPasswordChangeAttempt(admin.id)) return { error: TOO_MANY };

  let result;
  try {
    result = await changeAdminPassword(admin.id, parsed.data.currentPassword, parsed.data.newPassword);
  } catch (error) {
    console.error("Admin password change failed:", error);
    return { error: GENERIC_FAILURE };
  }

  if (result.status === "wrong_password") {
    return { fieldErrors: { currentPassword: "That isn't your current password" } };
  }
  if (result.status === "conflict") {
    return { error: "Your password was changed somewhere else while you were doing this. Sign in again." };
  }
  if (result.status !== "ok") return { error: GENERIC_FAILURE };

  // Every session for this account was just revoked, including this one — start a fresh one.
  let restarted = false;
  try {
    restarted = await startSession(admin.id, result.credentialVersion);
  } catch (error) {
    console.error("Admin session restart failed after a password change:", error);
  }
  if (!restarted) {
    return { error: "Your password was changed, but signing you back in failed. Sign in again with the new password." };
  }

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
