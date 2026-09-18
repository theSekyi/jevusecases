import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Account — jevusecases",
};

export default async function AccountPage() {
  const admin = await requireAdmin();

  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <AdminPageHeader title="Account" />
        <p className="font-bp-mono text-[13px] text-bp-secondary">{admin.email}</p>

        <section className="flex flex-col gap-4">
          <h2 className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">CHANGE PASSWORD</h2>
          <p className="text-sm text-bp-secondary">
            {admin.usingTempPassword
              ? "You're using a temporary password. Changing it is optional."
              : "You'll be signed out everywhere and asked to sign in with the new password."}
          </p>
          <ChangePasswordForm />
        </section>
      </div>
    </main>
  );
}
