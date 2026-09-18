import { LENSES, matchesLens, type LensKey } from "@/lib/lenses";
import { categoryGroup, evidenceScore, installCommand, projectFacts } from "@/lib/projectFacts";
import type { Project } from "@/lib/projects";

export type SortKey = "evidence" | "newest" | "az";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "evidence", label: "Most evidence" },
  { key: "newest", label: "Newest" },
  { key: "az", label: "A to Z" },
];

export interface Filters {
  query: string;
  lens: LensKey;
  category: string;
}

export const ALL_CATEGORIES = "all";

export const DEFAULT_FILTERS: Filters = { query: "", lens: "all", category: ALL_CATEGORIES };

function searchableText(project: Project): string {
  return [
    project.project,
    project.description,
    project.category,
    project.author,
    project.how_used_jev,
    project.replaces?.tool,
    project.replaces?.verdict,
    project.recipe?.type,
    installCommand(project),
    ...projectFacts(project).flatMap((fact) => [fact.value, fact.detail]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Every word in the query has to appear somewhere in the project, in any order. */
export function matchesQuery(project: Project, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchableText(project);
  return words.every((word) => haystack.includes(word));
}

function matchesCategory(project: Project, category: string): boolean {
  return category === ALL_CATEGORIES || categoryGroup(project) === category;
}

export function filterProjects(projects: Project[], filters: Filters): Project[] {
  return projects.filter(
    (project) =>
      matchesQuery(project, filters.query) &&
      matchesCategory(project, filters.category) &&
      matchesLens(project, filters.lens),
  );
}

export function sortProjects(projects: Project[], sort: SortKey): Project[] {
  const byName = (a: Project, b: Project) => a.project.localeCompare(b.project);
  return [...projects].sort((a, b) => {
    if (sort === "az") return byName(a, b);
    if (sort === "newest") return b.date_found.localeCompare(a.date_found) || byName(a, b);
    return evidenceScore(b) - evidenceScore(a) || b.date_found.localeCompare(a.date_found) || byName(a, b);
  });
}

/** How many projects each lens would show, given the current search and category. So the chips stay honest. */
export function lensCounts(projects: Project[], filters: Pick<Filters, "query" | "category">): Record<LensKey, number> {
  const counts = {} as Record<LensKey, number>;
  for (const lens of LENSES) {
    counts[lens.key] = filterProjects(projects, { ...filters, lens: lens.key }).length;
  }
  return counts;
}

export interface CategoryOption {
  value: string;
  label: string;
  count: number;
}

/** Categories present in the data, most projects first. Labels keep the case they were written in. */
export function categoryOptions(projects: Project[]): CategoryOption[] {
  const found = new Map<string, { label: string; count: number }>();
  for (const project of projects) {
    const value = categoryGroup(project);
    const written = project.category.split("/")[0].trim();
    const entry = found.get(value) ?? { label: written.charAt(0).toUpperCase() + written.slice(1), count: 0 };
    entry.count += 1;
    found.set(value, entry);
  }
  return [...found]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The project with the most proof that has real evidence to show. Never one that has only a recipe. */
export function featuredProject(projects: Project[]): Project | null {
  return sortProjects(projects, "evidence").find((project) => projectFacts(project).length > 0) ?? null;
}

export function isDefaultView(filters: Filters, sort: SortKey): boolean {
  return (
    filters.query.trim() === "" && filters.lens === "all" && filters.category === ALL_CATEGORIES && sort === "evidence"
  );
}
