import { hasNumbers } from "@/lib/projectFacts";
import type { Project } from "@/lib/projects";

export type LensKey = "all" | "replace" | "benchmark" | "cookbook";

export interface Lens {
  key: LensKey;
  label: string;
}

export const LENSES: Lens[] = [
  { key: "all", label: "All" },
  { key: "replace", label: "Replaces a paid tool" },
  { key: "benchmark", label: "Has numbers" },
  { key: "cookbook", label: "Copyable recipe" },
];

export function matchesLens(project: Project, lens: LensKey): boolean {
  switch (lens) {
    case "all":
      return true;
    case "replace":
      return project.replaces?.verdict != null;
    case "benchmark":
      return hasNumbers(project);
    case "cookbook":
      return project.recipe != null;
  }
}
