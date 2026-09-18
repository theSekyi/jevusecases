import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { ADMIN_PATH, getCurrentAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in — jevusecases",
};

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect(ADMIN_PATH);

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-bp-mono text-[11px] tracking-widest text-bp-accent">ADMIN</span>
          <h1 className="text-3xl font-bold">Sign in</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
