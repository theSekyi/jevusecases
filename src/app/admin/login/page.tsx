import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { ADMIN_PATH, getCurrentAdmin, PASSWORD_CHANGED_PARAM } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in — jevusecases",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getCurrentAdmin()) redirect(ADMIN_PATH);
  const passwordChanged = (await searchParams)[PASSWORD_CHANGED_PARAM] === "1";

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-bp-mono text-[11px] tracking-widest text-bp-accent">ADMIN</span>
          <h1 className="text-3xl font-bold">Sign in</h1>
        </div>
        {passwordChanged && (
          <p role="status" className="text-sm text-bp-ink">
            Password changed. Sign in with your new password.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
