import type { Project } from "@/lib/projects";

export type LensKey = "all" | "replace" | "benchmark" | "cookbook";

export interface Lens {
  key: LensKey;
  label: string;
  sub: string;
}

export const LENSES: Lens[] = [
  { key: "all", label: "ALL", sub: "everything" },
  { key: "replace", label: "REPLACE", sub: "replaces a paid tool" },
  { key: "benchmark", label: "BENCHMARK", sub: "has real numbers" },
  { key: "cookbook", label: "COOKBOOK", sub: "ready to copy" },
];

export function matchesLens(project: Project, lens: LensKey): boolean {
  switch (lens) {
    case "all":
      return true;
    case "replace":
      return project.replaces?.verdict != null;
    case "benchmark":
      return project.benchmark != null;
    case "cookbook":
      return project.recipe != null;
  }
}
