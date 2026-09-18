"use client";

import { useActionState } from "react";
import { login } from "@/app/admin/actions";
import { Field, fieldProps, inputClass, primaryButtonClass } from "@/components/FormField";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} noValidate className="flex w-full max-w-sm flex-col gap-6">
      <Field label="EMAIL" htmlFor="email">
        <input
          {...fieldProps("email")}
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.email}
          required
          className={inputClass}
        />
      </Field>

      <Field label="PASSWORD" htmlFor="password">
        <input
          {...fieldProps("password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      {state?.error && (
        <p role="alert" className="text-sm text-bp-accent">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
