import rawProjects from "@/data/projects.json";
import type { Project } from "@/lib/projectSchema";

export type { Project, Replaces } from "@/lib/projectSchema";

/**
 * Real, shipped projects only — excludes curation/explainer entries that aren't builds. The cast is safe:
 * every entry passed projectSchema when projects.json was generated.
 */
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

