import type { Replaces } from "@/lib/projects";

const STYLES: Record<NonNullable<Replaces["verdict"]>, string> = {
  YES: "border-bp-accent bg-bp-accent text-bp-bg",
  KINDA: "border-bp-accent text-bp-accent",
  "NOT REALLY": "border-bp-muted text-bp-secondary",
};

export function VerdictBadge({ verdict }: { verdict: NonNullable<Replaces["verdict"]> }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-bp-mono text-[11px] font-semibold ${STYLES[verdict]}`}
    >
      <span className="sr-only">Replaces a paid tool: </span>
      {verdict}
    </span>
  );
}
