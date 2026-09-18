import { cardStat, type Project } from "@/lib/projects";

export function Hero({ projects }: { projects: Project[] }) {
  const logEntries = projects.slice(0, 3);

  return (
    <section className="flex border-b border-bp-hairline bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="mx-auto flex w-full max-w-5xl">
        <div className="flex w-80 shrink-0 flex-col justify-center gap-4 pr-9">
          <span className="font-bp-mono text-[10px] tracking-widest text-bp-secondary">
            SINCE 2026-09-15
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Jev, tracked.</h1>
          <p className="text-sm text-bp-secondary">
            The log on the right updates every time a new build gets verified.
          </p>
          <a
            href="/submit"
            className="mt-1 self-start border border-bp-ink bg-bp-ink px-5 py-2.5 text-sm font-semibold text-bp-surface transition-colors hover:bg-[#142c46]"
          >
            Submit a project
          </a>
        </div>

        <div className="w-px bg-bp-hairline" />

        <div className="flex flex-1 flex-col justify-center gap-3 pl-9 font-bp-mono text-[13px]">
          {logEntries.map((project) => {
            const stat = cardStat(project);
            return (
              <div key={project.id} className="text-bp-secondary">
                {"> "}
                {project.project}
                {stat ? (
                  <>
                    {" — "}
                    <span className="text-bp-ink">{stat}</span>
                  </>
                ) : null}
              </div>
            );
          })}
          <div className="text-bp-ink">
            {"> "}
            {projects.length} builds tracked total
            <span className="ml-0.5 inline-block h-3.5 w-2 animate-[bp-cursor_1s_step-end_infinite] bg-bp-accent align-middle" />
          </div>
        </div>
      </div>
    </section>
  );
}
