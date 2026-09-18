import type { SubmissionInput } from "@/lib/submission";
import type { Project } from "@/lib/projects";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entry"
  );
}

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 8);
}

/** Turns a validated form submission into a full, unresearched Project entry: only the fields the submitter provided are filled in, the rest are null exactly like a freshly-scanned entry. */
export function buildSubmissionEntry(submission: SubmissionInput): Project {
  const { hostname } = new URL(submission.sourceLink);
  const isGithub = /(^|\.)github\.com$/i.test(hostname);
  const author = submission.xHandle ? `@${submission.xHandle.replace(/^@/, "")}` : null;

  return {
    id: `${slugify(submission.name)}-${randomSuffix()}`,
    project: submission.name,
    description: submission.description,
    github: isGithub ? submission.sourceLink : null,
    website: isGithub ? null : submission.sourceLink,
    how_used_jev: null,
    source_tweet: null,
    author,
    date_found: new Date().toISOString().slice(0, 10),
    is_build: true,
    category: submission.category,
    replaces: null,
    cost_signal: null,
    benchmark: null,
    jaggedness_reports: [],
    security_status: null,
    recipe: null,
  };
}
