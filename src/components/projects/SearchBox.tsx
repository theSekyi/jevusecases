import type { RefObject } from "react";

export function SearchBox({
  value,
  onChange,
  count,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  count: number;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative max-w-2xl">
      <label htmlFor="project-search" className="sr-only">
        Search projects
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-bp-secondary"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3.5 3.5" />
      </svg>
      <input
        ref={inputRef}
        id="project-search"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (value) onChange("");
            else event.currentTarget.blur();
          }
        }}
        placeholder={`Search ${count} projects`}
        className="h-14 w-full rounded-xl border border-bp-muted bg-bp-surface pl-12 pr-16 text-base text-bp-ink transition-colors placeholder:text-bp-secondary focus:border-bp-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm text-bp-secondary transition-colors hover:text-bp-ink"
        >
          Clear
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-bp-muted px-2 py-0.5 font-bp-mono text-xs text-bp-secondary sm:block"
        >
          /
        </kbd>
      )}
    </div>
  );
}
