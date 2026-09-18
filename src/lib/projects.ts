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
  how_used_jev: string | null;
  source_tweet: string | null;
  author: string | null;
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

