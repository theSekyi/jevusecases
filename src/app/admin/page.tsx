import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { requireAdmin } from "@/lib/auth";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "Admin — jevusecases",
};

export default async function AdminPage() {
  const admin = await requireAdmin();

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-sm flex-col gap-10">
        <div className="flex flex-col gap-2">
          <span className="font-bp-mono text-[11px] tracking-widest text-bp-accent">ADMIN</span>
          <h1 className="text-3xl font-bold">Signed in</h1>
          <p className="font-bp-mono text-[13px] text-bp-secondary">{admin.email}</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">PASSWORD</h2>
          {admin.usingTempPassword && (
            <p role="status" className="text-sm text-bp-secondary">
              You&apos;re using a temporary password. Changing it is optional, and you can do it any time.
            </p>
          )}
          <ChangePasswordForm />
        </section>

        <form action={logout}>
          <button
            type="submit"
            className="border border-bp-ink px-5 py-2.5 text-sm font-semibold text-bp-ink transition-colors hover:border-bp-accent hover:text-bp-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
