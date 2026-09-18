import { describe, expect, test } from "vitest";
import { categoryGroup, evidenceScore, installCommand, primaryFact, projectFacts } from "../projectFacts";
import { getProjects, type Project } from "../projects";

const byId = (id: string) => getProjects().find((project) => project.id === id)!;

const bare = (overrides: Partial<Project> = {}): Project => ({
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
});

describe("projectFacts", () => {
  test("puts what a project replaced first, then the comparison, then cost", () => {
    const facts = projectFacts(byId("leepokai-jev-guard"));

    expect(facts.map((fact) => fact.kind)).toEqual(["verdict", "comparison", "cost"]);
    expect(facts[0]).toMatchObject({ label: "Replaces", value: "Claude Haiku 4.5 (as a tool-call classifier)" });
    expect(facts[0].detail).toMatch(/^YES/);
    expect(facts[1].value).toBe("3.4x faster, 28x cheaper vs Haiku 4.5");
  });

  test("formats millisecond and second latencies, and a per-run cost", () => {
    expect(projectFacts(byId("jarrodwatts-jev-trader"))[0]).toMatchObject({ kind: "speed", value: "81 ms" });

    const facts = projectFacts(byId("gregpr07-jev-ultrafast"));
    expect(facts.map((fact) => [fact.kind, fact.value])).toEqual([
      ["speed", "7.1 s"],
      ["cost", "$0.0039"],
    ]);
  });

  test("keeps string latencies such as '<1' as written", () => {
    expect(projectFacts(byId("ekzhang-openjev-sglang")).find((fact) => fact.kind === "speed")?.value).toBe("<1 s");
  });

  test("says 'a paid tool' when a verdict has no named tool", () => {
    const project = bare({ replaces: { tool: null, verdict: "KINDA", notes: "close" } });

    expect(primaryFact(project)).toMatchObject({ value: "a paid tool", detail: "KINDA · close" });
  });

  test("a project with no evidence has no facts, and never shows an invented one", () => {
    expect(projectFacts(byId("ctatedev-ai-cli"))).toEqual([]);
    expect(primaryFact(byId("ctatedev-ai-cli"))).toBeNull();
  });

  test("ignores blank cost text", () => {
    expect(projectFacts(bare({ cost_signal: { basis: "   " } }))).toEqual([]);
  });
});

describe("evidenceScore", () => {
  test("ranks a strong verdict with numbers above a bare project", () => {
    expect(evidenceScore(byId("leepokai-jev-guard"))).toBeGreaterThan(evidenceScore(byId("ctatedev-ai-cli")));
    expect(evidenceScore(bare())).toBe(0);
  });

  test("weighs YES above KINDA above NOT REALLY", () => {
    const score = (verdict: "YES" | "KINDA" | "NOT REALLY") =>
      evidenceScore(bare({ replaces: { tool: "t", verdict, notes: null } }));

    expect(score("YES")).toBeGreaterThan(score("KINDA"));
    expect(score("KINDA")).toBeGreaterThan(score("NOT REALLY"));
  });
});

describe("installCommand", () => {
  test("prefers the recipe's install command", () => {
    expect(installCommand(byId("ctatedev-ai-cli"))).toBe("npm install -g ai-cli");
  });

  test("uses a command hiding in the website field, but never a URL", () => {
    expect(installCommand(byId("gnumanth-pkg-gate"))).toBe("npx pkg-gate <pkg>");
    expect(installCommand(bare({ website: "https://example.com" }))).toBeNull();
    expect(installCommand(bare({ website: "just some words" }))).toBeNull();
  });

  test("returns null with nothing to run", () => {
    expect(installCommand(bare())).toBeNull();
  });
});

describe("categoryGroup", () => {
  test("keeps the part before the slash, lower case", () => {
    expect(categoryGroup(bare({ category: "Dev tooling / CLI" }))).toBe("dev tooling");
    expect(categoryGroup(bare({ category: "novelty" }))).toBe("novelty");
  });
});
