"use client";

import { useEffect, useRef } from "react";
import { installCommand, projectFacts } from "@/lib/projectFacts";
import { sourceLink, type Project } from "@/lib/projects";
import { CopyButton } from "./CopyButton";
import { VerdictBadge } from "./VerdictBadge";

function authorLink(author: string | null): string | null {
  return author && /^@\w{1,15}$/.test(author) ? `https://x.com/${author.slice(1)}` : null;
}

function addedOn(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

const linkClass = "text-bp-ink underline decoration-bp-muted underline-offset-4 transition-colors hover:text-bp-accent";

export function ProjectPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const facts = projectFacts(project);
  const install = installCommand(project);
  const source = sourceLink(project);
  const author = authorLink(project.author);
  const verdict = project.replaces?.verdict;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="panel-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="bp-panel m-0 ml-auto h-dvh max-h-none w-full max-w-xl overflow-y-auto border-l border-bp-hairline bg-bp-surface p-0 text-bp-ink backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-8 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bp-mono text-xs text-bp-secondary">{project.category}</span>
            {verdict && <VerdictBadge verdict={verdict} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 rounded-md px-3 py-1.5 text-sm text-bp-secondary transition-colors hover:text-bp-ink"
          >
            Close <span className="font-bp-mono text-xs text-bp-muted">Esc</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <h2 id="panel-title" className="text-balance text-3xl [overflow-wrap:anywhere] font-semibold leading-tight tracking-tight">
            {project.project}
          </h2>
          <p className="text-base leading-relaxed text-bp-secondary">{project.description}</p>
          <p className="font-bp-mono text-xs text-bp-muted">
            {author ? (
              <a href={author} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {project.author}
              </a>
            ) : (
              project.author
            )}
            {project.author ? " · " : ""}added {addedOn(project.date_found)}
          </p>
        </div>

        {facts.length > 0 && (
          <section aria-labelledby="panel-evidence" className="flex flex-col gap-3">
            <h3 id="panel-evidence" className="text-sm font-semibold">
              The evidence
            </h3>
            <dl className="flex flex-col divide-y divide-bp-hairline rounded-xl border border-bp-hairline bg-bp-bg">
              {facts.map((fact) => (
                <div key={`${fact.kind}-${fact.value}`} className="flex flex-col gap-1 p-4">
                  <dt className="text-xs text-bp-secondary">{fact.label}</dt>
                  <dd className="font-bp-mono text-base leading-snug [overflow-wrap:anywhere]">{fact.value}</dd>
                  {fact.detail && <dd className="text-sm text-bp-secondary">{fact.detail}</dd>}
                </div>
              ))}
            </dl>
          </section>
        )}

        {project.how_used_jev && (
          <section aria-labelledby="panel-how" className="flex flex-col gap-3">
            <h3 id="panel-how" className="text-sm font-semibold">
              How it uses Jev
            </h3>
            <p className="text-[15px] leading-relaxed text-bp-secondary">{project.how_used_jev}</p>
          </section>
        )}

        {(install || project.recipe) && (
          <section aria-labelledby="panel-recipe" className="flex flex-col gap-3">
            <h3 id="panel-recipe" className="text-sm font-semibold">
              Try it
            </h3>
            {project.recipe && <p className="text-sm text-bp-secondary">{project.recipe.type}</p>}
            {install && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-bp-hairline bg-bp-bg p-3">
                <code className="min-w-0 overflow-x-auto whitespace-nowrap font-bp-mono text-sm">{install}</code>
                <CopyButton text={install} label="install command" />
              </div>
            )}
          </section>
        )}

        {(source || project.source_tweet) && (
          <section aria-labelledby="panel-links" className="flex flex-col gap-3">
            <h3 id="panel-links" className="text-sm font-semibold">
              Links
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              {source && (
                <li>
                  <a href={source.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {source.label}
                  </a>
                </li>
              )}
              {project.source_tweet && (
                <li>
                  <a href={project.source_tweet} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Where it was announced
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
    </dialog>
  );
}
