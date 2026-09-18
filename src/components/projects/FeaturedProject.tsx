import { projectFacts } from "@/lib/projectFacts";
import { openProjectOnClick } from "@/lib/useProjectHash";
import type { Project } from "@/lib/projects";
import { FactList } from "./FactList";
import { VerdictBadge } from "./VerdictBadge";

export function FeaturedProject({ project }: { project: Project }) {
  const facts = projectFacts(project).slice(0, 3);
  const verdict = project.replaces?.verdict;

  return (
    <a
      href={`#${project.id}`}
      onClick={(event) => openProjectOnClick(event, project.id)}
      aria-haspopup="dialog"
      className="group grid min-w-0 animate-[bp-card-in_500ms_var(--ease-out-expo)_backwards] gap-8 rounded-2xl border border-bp-muted bg-bp-surface p-6 transition-colors duration-200 hover:border-bp-accent sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-bp-raised px-3 py-1 text-xs font-medium text-bp-ink">Strongest evidence</span>
          <span className="font-bp-mono text-xs text-bp-secondary">{project.category}</span>
          {verdict && <VerdictBadge verdict={verdict} />}
        </div>
        <h3 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{project.project}</h3>
        <p className="max-w-[55ch] text-base leading-relaxed text-bp-secondary">{project.description}</p>
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-bp-accent">
          See how it was built{" "}
          <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>

      <FactList facts={facts} />
    </a>
  );
}
