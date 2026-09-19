import { z } from "zod";

export const CATEGORIES = [
  "trading / on-chain agents",
  "security / guardrails",
  "security / supply chain",
  "dev tooling / CLI",
  "dev tooling / IDE",
  "dev tooling / library",
  "apps / personal tools",
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

const text = z.string().trim().min(1);
const httpsUrl = (hostname?: RegExp) => z.url({ protocol: /^https$/, hostname });

/**
 * One entry in src/data/entries/<id>/entry.json. The site's Project type comes from here, so what the
 * generator accepts and what the components expect can't drift apart.
 */
export const projectSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, digits and single hyphens"),
  project: text,
  description: text,
  github: httpsUrl(/^github\.com$/)
    .regex(/^https:\/\/github\.com\/[^/]+\/[^/]+/i, "link to a repository, like https://github.com/owner/repo")
    .nullable(),
  // A link, or sometimes an install command (see installCommand in projectFacts.ts).
  website: text.nullable(),
  how_used_jev: text.nullable(),
  source_tweet: httpsUrl(/^(x|twitter)\.com$/).nullable(),
  // The panel links the author to x.com.
  author: z.string().regex(/^@\w{1,15}$/, "use an X handle like @name").nullable(),
  date_found: z.iso.date("use a real date like 2026-09-17"),
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
  recipe: z.strictObject({ type: text, link: httpsUrl().optional(), install: text.optional() }).nullable(),
});

export type Project = z.infer<typeof projectSchema>;
export type Replaces = NonNullable<Project["replaces"]>;
