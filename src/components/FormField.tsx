import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-bp-muted bg-bp-surface px-3 py-2 text-sm text-bp-ink transition-colors placeholder:text-bp-secondary focus:border-bp-accent";

export const primaryButtonClass =
  "self-start rounded-md border border-bp-accent bg-bp-accent px-5 py-2.5 text-sm font-semibold text-bp-bg transition-colors hover:border-bp-accent-strong hover:bg-bp-accent-strong disabled:cursor-not-allowed disabled:border-bp-hairline disabled:bg-bp-hairline disabled:text-bp-secondary";

export function fieldProps(id: string, error?: string) {
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">
        {label}
      </label>
      {children}
      {hint && !error && <span className="text-xs text-bp-secondary">{hint}</span>}
      {error && (
        <span id={`${htmlFor}-error`} role="alert" className="text-xs text-bp-accent">
          {error}
        </span>
      )}
    </div>
  );
}
