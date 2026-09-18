"use client";

import { useState } from "react";
import { LENSES, matchesLens, type LensKey } from "@/lib/lenses";
import { cardStat, sourceLink, type Project } from "@/lib/projects";

export function ProjectGrid({ projects }: { projects: Project[] }) {
  const [lens, setLens] = useState<LensKey>("all");
  const visible = projects.filter((project) => matchesLens(project, lens));

  return (
    <section className="bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-start gap-6">
          <span className="pt-1.5 font-bp-mono text-[10px] tracking-widest text-bp-secondary">
            {visible.length} OF {projects.length}
          </span>
          <div className="flex">
            {LENSES.map((option) => {
              const active = option.key === lens;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setLens(option.key)}
                  className={`mr-6 flex flex-col gap-1 border-b-2 py-1.5 text-left ${
                    active ? "border-bp-ink" : "border-transparent"
                  }`}
                >
                  <span
                    className={`font-bp-mono text-[10px] tracking-widest ${
                      active ? "text-bp-ink" : "text-bp-secondary"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="text-[9px] text-bp-secondary">{option.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const stat = cardStat(project);
  const link = sourceLink(project);

  return (
    <div
      className="group relative flex animate-[bp-card-in_220ms_ease-out] flex-col gap-3 border border-bp-hairline bg-bp-surface p-6 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-bp-ink hover:shadow-[0_10px_24px_rgba(27,58,92,0.12)]"
    >
      <Corner className="left-[-1px] top-[-1px] border-l-2 border-t-2" />
      <Corner className="right-[-1px] top-[-1px] border-r-2 border-t-2" />
      <Corner className="bottom-[-1px] left-[-1px] border-b-2 border-l-2" />
      <Corner className="bottom-[-1px] right-[-1px] border-b-2 border-r-2" />

      <div>
        <div className="text-lg font-bold">{project.project}</div>
        <span className="font-bp-mono text-[9px] tracking-widest text-bp-secondary">
          {project.category.toUpperCase()}
        </span>
      </div>

      <p className="text-sm leading-relaxed">{project.description}</p>

      <div className="flex flex-col gap-1 font-bp-mono text-[11px] text-bp-secondary">
        {stat && <span>{stat}</span>}
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bp-ink underline hover:text-bp-accent"
          >
            {link.label}
          </a>
        )}
        <span>{project.author}</span>
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <div
      className={`absolute h-3.5 w-3.5 border-bp-ink transition-colors group-hover:border-bp-accent ${className}`}
    />
  );
}
