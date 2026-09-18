import { primaryFact } from "@/lib/projectFacts";
import type { Project } from "@/lib/projects";
import { openProjectOnClick } from "@/lib/useProjectHash";
import { VerdictBadge } from "./VerdictBadge";

export function ProjectCard({ project, index }: { project: Project; index: number }) {
  const fact = primaryFact(project);
  const verdict = project.replaces?.verdict;

  return (
    <a
      href={`#${project.id}`}
      onClick={(event) => openProjectOnClick(event, project.id)}
      aria-haspopup="dialog"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className="group flex min-w-0 animate-[bp-card-in_420ms_var(--ease-out-expo)_backwards] flex-col gap-4 rounded-xl border border-bp-hairline bg-bp-surface p-5 transition-colors duration-200 hover:border-bp-muted hover:bg-bp-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-bp-mono text-xs text-bp-secondary">{project.category}</span>
        {verdict && <VerdictBadge verdict={verdict} />}
      </div>

      <h3 className="text-xl font-semibold leading-tight tracking-tight text-bp-ink [overflow-wrap:anywhere]">{project.project}</h3>

      {fact && (
        <div className="flex flex-col gap-1 border-l border-bp-hairline pl-3">
          <span className="text-xs text-bp-secondary">{fact.label}</span>
          <span className="line-clamp-2 font-bp-mono text-[15px] leading-snug text-bp-ink [overflow-wrap:anywhere]">{fact.value}</span>
        </div>
      )}

      <p className="line-clamp-3 text-sm leading-relaxed text-bp-secondary">{project.description}</p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1 font-bp-mono text-xs">
        <span className="truncate text-bp-muted group-hover:text-bp-secondary">{project.author}</span>
        <span className="shrink-0 text-bp-secondary transition-colors group-hover:text-bp-accent">
          How it was built <span aria-hidden="true">→</span>
        </span>
      </div>
    </a>
  );
}
