import type { Project } from "./projectSchema";
/** The source link to show on a card: prefer a real repo/site, fall back to an install command. */
export function sourceLink(project: Pick<Project, "github" | "website">): { href: string; label: string } | null {
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
