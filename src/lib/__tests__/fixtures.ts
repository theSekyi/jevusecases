import type { Project } from "../projects";

/** A project with nothing but the required fields. Tests add only what they care about. */
export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "x",
    project: "X",
    description: "d",
    github: null,
    website: null,
    how_used_jev: null,
    source_tweet: null,
    author: null,
    date_found: "2026-09-17",
    is_build: true,
    category: "misc / thing",
    replaces: null,
    cost_signal: null,
    benchmark: null,
    jaggedness_reports: [],
    security_status: null,
    recipe: null,
    ...overrides,
  };
}

/** Small stand-ins for the real shapes, so tests don't depend on the live entries or their counts. */
export const guard = makeProject({
  id: "guard",
  project: "jev-guard",
  description: "Security classifier for coding-agent tool calls.",
  category: "security / guardrails",
  author: "@guardian",
  how_used_jev: "Classifies every tool call.",
  replaces: { tool: "Claude Haiku 4.5", verdict: "YES", notes: null },
  benchmark: { comparison: "3.4x faster, 28x cheaper vs Haiku 4.5", task: "tool-call safety classification" },
  cost_signal: { basis: "author reports 28x cheaper (unverified)" },
  recipe: { type: "open-source implementation" },
  github: "https://github.com/example/jev-guard",
});

export const trader = makeProject({
  id: "trader",
  project: "Jev Trader",
  description: "Trading bot that decides on a live price feed.",
  category: "trading / on-chain agents",
  author: "@trader",
  benchmark: { latency_ms: 81, task: "decision per block" },
  recipe: { type: "open-source implementation" },
  github: "https://github.com/example/jev-trader",
});

export const ultrafast = makeProject({
  id: "ultrafast",
  project: "Browser Use + Jev Ultrafast",
  description: "Browser agent that found a real flight.",
  category: "browser agents / automation",
  benchmark: { latency_s: 7.1, cost_usd: 0.0039, task: "flight search" },
  recipe: { type: "open-source implementation" },
});

export const sglang = makeProject({
  id: "sglang",
  project: "openjev-sglang",
  description: "Open-source, Jev-compatible API.",
  category: "infra / open reimplementation",
  replaces: { tool: "a hosted Jev API", verdict: "KINDA", notes: null },
  benchmark: { latency_s: "<1", task: "64 parallel tasks" },
  recipe: { type: "open-source implementation" },
});

export const jeven = makeProject({
  id: "jeven",
  project: "is-jeven",
  description: "Checks whether a number is even by asking Jev.",
  category: "novelty / joke",
  replaces: { tool: "the % operator", verdict: "NOT REALLY", notes: null },
  recipe: { type: "open-source implementation" },
});

export const cli = makeProject({
  id: "cli",
  project: "ai-cli",
  description: "CLI for agent harnesses.",
  category: "dev tooling / CLI",
  author: "@clidev",
  recipe: { type: "npm package", install: "npm install -g ai-cli" },
});

export const gate = makeProject({
  id: "gate",
  project: "pkg-gate",
  description: "Screens npm packages before install.",
  category: "security / supply chain",
  website: "npx pkg-gate <pkg>",
  benchmark: { latency_ms: 100, task: "pre-install screening" },
  recipe: { type: "npm package" },
});

export const fsd = makeProject({
  id: "fsd",
  project: "Decision loop",
  description: "A robotics experiment with nothing to show yet.",
  category: "robotics / simulation",
});

export const FIXTURE_PROJECTS: Project[] = [guard, trader, ultrafast, sglang, jeven, cli, gate, fsd];
