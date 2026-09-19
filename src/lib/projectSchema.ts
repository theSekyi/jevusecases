import { z } from "zod";

export const CATEGORIES = [
  "trading / on-chain agents",
  "security / guardrails",
  "security / supply chain",
  "dev tooling / CLI",
  "dev tooling / IDE",
  "browser agents / automation",
  "robotics / simulation",
  "exploration / benchmarking",
  "agent tooling / skills",
  "agent context / memory",
  "routing / model selection",
  "content moderation / classification",
  "infra / open reimplementation",
  "novelty / joke",
  "explainer / curation",
] as const;

/** A YYYY-MM-DD date that exists on the calendar (2026-02-30 doesn't). */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const text = z.string().trim().min(1);
const httpsUrl = (hostname: RegExp) => z.url({ protocol: /^https$/, hostname });

/**
 * One entry in src/data/entries/<id>/entry.json. The site's Project type comes from here, so what the
 * generator accepts and what the components expect can't drift apart.
 */
export const projectSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, digits and single hyphens"),
  project: text,
  description: text,
  github: httpsUrl(/^github\.com$/).nullable(),
  // A link, or sometimes an install command (see installCommand in projectFacts.ts).
  website: text.nullable(),
  how_used_jev: text.nullable(),
  source_tweet: httpsUrl(/^(x|twitter)\.com$/).nullable(),
  // The panel links an @handle to x.com, so nothing else may look like one.
  author: z.string().regex(/^@\w{1,15}$/, "use an X handle like @name").nullable(),
  date_found: z.string().refine(isRealDate, "use a real date like 2026-09-17"),
  is_build: z.boolean(),
  category: z.enum(CATEGORIES),
  replaces: z
    .strictObject({
      tool: text.nullable(),
      verdict: z.enum(["YES", "KINDA", "NOT REALLY"]).nullable(),
      notes: text.nullable(),
    })
    .nullable(),
  cost_signal: z.record(z.string(), z.unknown()).nullable(),
  benchmark: z.record(z.string(), z.unknown()).nullable(),
  jaggedness_reports: z.array(z.unknown()),
  security_status: z.strictObject({ red_teamed: z.boolean(), notes: text.nullable() }).nullable(),
  recipe: z.strictObject({ type: text, link: z.url().optional(), install: text.optional() }).nullable(),
});

export type Project = z.infer<typeof projectSchema>;
export type Replaces = NonNullable<Project["replaces"]>;
