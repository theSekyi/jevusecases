import type { Fact } from "@/lib/projectFacts";

export function FactList({ facts, showDetail = false }: { facts: Fact[]; showDetail?: boolean }) {
  return (
    <dl className="flex flex-col divide-y divide-bp-hairline rounded-xl border border-bp-hairline bg-bp-bg">
      {facts.map((fact) => (
        <div key={`${fact.kind}-${fact.value}`} className="flex flex-col gap-1 p-4">
          <dt className="text-xs text-bp-secondary">{fact.label}</dt>
          <dd className="font-bp-mono text-base leading-snug text-bp-ink [overflow-wrap:anywhere]">{fact.value}</dd>
          {showDetail && fact.detail && <dd className="text-sm text-bp-secondary">{fact.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}
