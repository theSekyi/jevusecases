import type { Project } from "@/lib/projects";

export type FactKind = "verdict" | "comparison" | "speed" | "cost";

/** One piece of evidence a project can show. `detail` is the fine print (a task, notes, a verdict). */
export interface Fact {
  kind: FactKind;
  label: string;
  value: string;
  detail?: string;
}

const VERDICT_WEIGHT = { YES: 3, KINDA: 2, "NOT REALLY": 1 } as const;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Every fact the project has, strongest first: what it replaced, a comparison, speed, then cost. */
export function projectFacts(project: Project): Fact[] {
  const facts: Fact[] = [];
  const { replaces, benchmark: bench, cost_signal: cost } = project;

  if (replaces?.verdict) {
    facts.push({
      kind: "verdict",
      label: "Replaces",
      value: replaces.tool ?? "a paid tool",
      detail: [replaces.verdict, replaces.notes].filter(Boolean).join(" · "),
    });
  }

  if (bench) {
    const task = text(bench.task);
    const comparison = text(bench.comparison);
    if (comparison) facts.push({ kind: "comparison", label: "Against the baseline", value: comparison, detail: task });

    if (typeof bench.latency_ms === "number") {
      facts.push({ kind: "speed", label: "Latency", value: `${bench.latency_ms} ms`, detail: task ?? text(bench.notes) });
    } else if (typeof bench.latency_s === "number" || typeof bench.latency_s === "string") {
      facts.push({ kind: "speed", label: "Latency", value: `${bench.latency_s} s`, detail: task ?? text(bench.notes) });
    }
    if (typeof bench.cost_usd === "number") {
      facts.push({ kind: "cost", label: "Cost per run", value: `$${bench.cost_usd}`, detail: task });
    }
  }

  const basis = text(cost?.basis);
  if (basis) facts.push({ kind: "cost", label: "Cost signal", value: basis });

  return facts;
}

/** How much proof a project carries, counted from the facts it can actually show. Ranks the default order. */
export function evidenceScore(project: Project): number {
  const facts = projectFacts(project);
  let score = project.replaces?.verdict ? VERDICT_WEIGHT[project.replaces.verdict] : 0;
  if (facts.some((fact) => fact.kind === "speed" || fact.kind === "comparison")) score += 2;
  if (facts.some((fact) => fact.kind === "cost")) score += 1;
  if (project.recipe) score += 1;
  return score;
}

/** True when the project reports a measured figure: a latency, a comparison or a cost per run. */
export function hasNumbers(project: Project): boolean {
  return projectFacts(project).some(
    (fact) => fact.kind === "speed" || fact.kind === "comparison" || (fact.kind === "cost" && fact.label === "Cost per run"),
  );
}

export function primaryFact(project: Project): Fact | null {
  return projectFacts(project)[0] ?? null;
}

/** A command to run, if the project ships one. The website field sometimes holds it instead of a link. */
export function installCommand(project: Project): string | null {
  const fromRecipe = text(project.recipe?.install);
  if (fromRecipe) return fromRecipe;

  const site = text(project.website);
  if (!site) return null;
  try {
    new URL(site);
    return null;
  } catch {
    return /^(npm|npx|pnpm|yarn|bunx?|pip|uv|cargo|brew)\b/.test(site) ? site : null;
  }
}

/** The part of the category before the slash: "dev tooling / CLI" becomes "dev tooling". */
export function categoryGroup(project: Project): string {
  return project.category.split("/")[0].trim().toLowerCase();
}
