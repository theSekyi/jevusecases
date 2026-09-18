import rawProjects from "@/data/projects.json";

export interface Replaces {
  tool: string | null;
  verdict: "YES" | "KINDA" | "NOT REALLY" | null;
  notes: string | null;
}

export interface SecurityStatus {
  red_teamed: boolean;
  notes: string | null;
}

export interface Recipe {
  type: string;
  link?: string;
  install?: string;
}

export interface Project {
  id: string;
  project: string;
  description: string;
  github: string | null;
  website: string | null;
  how_used_jev: string;
  source_tweet: string | null;
  author: string;
  date_found: string;
  is_build: boolean;
  category: string;
  replaces: Replaces | null;
  cost_signal: Record<string, unknown> | null;
  benchmark: Record<string, unknown> | null;
  jaggedness_reports: unknown[];
  security_status: SecurityStatus | null;
  recipe: Recipe | null;
}

/** Real, shipped projects only — excludes curation/explainer entries that aren't builds. */
export function getProjects(): Project[] {
  return (rawProjects as Project[]).filter((project) => project.is_build);
}

/** The source link to show on a card: prefer a real repo/site, fall back to an install command. */
export function sourceLink(project: Project): { href: string; label: string } | null {
  if (project.github) {
    return { href: project.github, label: project.github.replace(/^https?:\/\//, "") };
  }
  if (project.website) {
    try {
      new URL(project.website);
      return { href: project.website, label: project.website.replace(/^https?:\/\//, "") };
    } catch {
      return null;
    }
  }
  return null;
}

/** The one headline stat for a card, in priority order: a replace verdict, then any benchmark figure. */
export function cardStat(project: Project): string | null {
  if (project.replaces?.verdict) {
    const tool = project.replaces.tool ?? "a paid tool";
    return `replaces ${tool} — ${project.replaces.verdict}`;
  }

  const b = project.benchmark;
  if (!b) return null;
  if (typeof b.latency_ms === "number") return `${b.latency_ms}ms`;
  if (typeof b.latency_s === "number" || typeof b.latency_s === "string") {
    const cost = typeof b.cost_usd === "number" ? ` · $${b.cost_usd}` : "";
    return `${b.latency_s}s${cost}`;
  }
  if (typeof b.comparison === "string") return b.comparison;
  return null;
}
