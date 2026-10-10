"use client";

import type { ReactNode } from "react";
import { ProjectExplorer } from "@/components/ProjectExplorer";
import { getProjects } from "@/lib/projects";

// The static client bundle carries the catalogue once, rather than serializing it into every page's RSC payload.
export function ProjectCatalogue({ live }: { live?: ReactNode }) {
  return <ProjectExplorer projects={getProjects()} live={live} />;
}
