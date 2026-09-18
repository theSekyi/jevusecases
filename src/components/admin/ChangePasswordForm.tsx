"use client";

import { useActionState, useState, type FormEvent } from "react";
import { changePassword } from "@/app/admin/actions";
import { Field, fieldProps, inputClass, primaryButtonClass } from "@/components/FormField";
import {
  changePasswordSchema,
  firstFieldErrors,
  MIN_PASSWORD_LENGTH,
  type PasswordFieldErrors,
} from "@/lib/authSchema";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const [clientErrors, setClientErrors] = useState<PasswordFieldErrors>({});
  const errors = { ...state?.fieldErrors, ...clientErrors };

  // React clears an uncontrolled form once its action finishes. Catching a typo here, before the
  // action runs, keeps the fields filled in; the server still validates everything itself.
  function checkBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: data.get("currentPassword"),
      newPassword: data.get("newPassword"),
      confirmPassword: data.get("confirmPassword"),
    });
    if (parsed.success) {
      setClientErrors({});
    } else {
      event.preventDefault();
      setClientErrors(firstFieldErrors(parsed.error));
    }
  }

  return (
    <form action={action} onSubmit={checkBeforeSubmit} noValidate className="flex w-full max-w-sm flex-col gap-6">
      <Field label="CURRENT PASSWORD" htmlFor="currentPassword" error={errors.currentPassword}>
        <input
          {...fieldProps("currentPassword", errors.currentPassword)}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>

      <Field
        label="NEW PASSWORD"
        htmlFor="newPassword"
        error={errors.newPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
      >
        <input
          {...fieldProps("newPassword", errors.newPassword)}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <Field label="CONFIRM NEW PASSWORD" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <input
          {...fieldProps("confirmPassword", errors.confirmPassword)}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      {state?.error && (
        <p role="alert" className="text-sm text-bp-accent">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
