"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Hero } from "@/components/Hero";
import { FeaturedProject } from "@/components/projects/FeaturedProject";
import { FilterBar } from "@/components/projects/FilterBar";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectPanel } from "@/components/projects/ProjectPanel";
import { SearchBox } from "@/components/projects/SearchBox";
import type { LensKey } from "@/lib/lenses";
import {
  DEFAULT_FILTERS,
  categoryOptions,
  featuredProject,
  filterProjects,
  isDefaultView,
  lensCounts,
  sortProjects,
  type SortKey,
} from "@/lib/projectSearch";
import type { Project } from "@/lib/projects";
import { clearProjectHash, useProjectHash } from "@/lib/useProjectHash";

/** Pressing "/" anywhere on the page jumps to search, unless you are already typing somewhere. */
function useSearchShortcut(input: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], dialog[open]")) return;
      event.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [input]);
}

export function ProjectExplorer({ projects, live }: { projects: Project[]; live?: ReactNode }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>("evidence");
  const searchRef = useRef<HTMLInputElement>(null);
  const openId = useProjectHash();
  useSearchShortcut(searchRef);

  const visible = useMemo(() => sortProjects(filterProjects(projects, filters), sort), [projects, filters, sort]);
  const counts = useMemo(() => lensCounts(projects, filters), [projects, filters]);
  const categories = useMemo(() => categoryOptions(projects), [projects]);
  const featured = useMemo(
    () => (isDefaultView(filters, sort) ? featuredProject(projects) : null),
    [projects, filters, sort],
  );
  const rest = featured ? visible.filter((project) => project.id !== featured.id) : visible;
  const openProject = projects.find((project) => project.id === openId) ?? null;

  function closePanel() {
    const id = openProject?.id;
    clearProjectHash();
    // Hand focus back to the card that opened it, so keyboard users don't lose their place.
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`a[href="#${id}"]`)?.focus());
  }

  const filtered = !isDefaultView(filters, sort) || visible.length !== projects.length;

  return (
    <>
      <Hero
        live={live}
        search={
          <SearchBox
            inputRef={searchRef}
            value={filters.query}
            onChange={(query) => setFilters((current) => ({ ...current, query }))}
            count={projects.length}
          />
        }
      />

      <section aria-labelledby="projects-heading" className="px-6 py-12 sm:py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <h2 id="projects-heading" className="sr-only">
            Projects
          </h2>

          <FilterBar
            lens={filters.lens}
            onLens={(lens: LensKey) => setFilters((current) => ({ ...current, lens }))}
            counts={counts}
            category={filters.category}
            onCategory={(category) => setFilters((current) => ({ ...current, category }))}
            categories={categories}
            sort={sort}
            onSort={setSort}
          />

          <p role="status" className="font-bp-mono text-xs text-bp-secondary">
            {filtered ? `Showing ${visible.length} of ${projects.length} projects` : `${projects.length} projects`}
          </p>

          {featured && <FeaturedProject project={featured} />}

          {visible.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
              {rest.map((project, index) => (
                <ProjectCard key={project.id} project={project} index={index} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-bp-muted p-8 sm:p-12">
              <p className="text-lg font-semibold">
                {filters.query.trim() ? `No projects match “${filters.query.trim()}”.` : "No projects match these filters."}
              </p>
              <p className="max-w-[52ch] text-sm text-bp-secondary">
                Try fewer words or another category. If it isn&apos;t here, it may not have been added yet.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setSort("evidence");
                  }}
                  className="rounded-md border border-bp-muted px-4 py-2 text-sm font-semibold transition-colors hover:border-bp-accent hover:text-bp-accent"
                >
                  Clear search and filters
                </button>
                <a href="/submit" className="text-sm font-semibold text-bp-accent underline underline-offset-4">
                  Submit a project
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {openProject && <ProjectPanel key={openProject.id} project={openProject} onClose={closePanel} />}
    </>
  );
}
