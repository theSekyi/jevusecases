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

export { sourceLink } from "./projectLinks";
