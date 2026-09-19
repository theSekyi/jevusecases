import { describe, expect, test } from "vitest";
import { categoryGroup, evidenceScore, hasNumbers, installCommand, primaryFact, projectFacts } from "../projectFacts";
import { cli, fsd, gate, guard, jeven, makeProject, sglang, trader, ultrafast } from "./fixtures";

describe("projectFacts", () => {
  test("puts what a project replaced first, then the comparison, then cost", () => {
    const facts = projectFacts(guard);

    expect(facts.map((fact) => fact.kind)).toEqual(["verdict", "comparison", "cost"]);
    expect(facts[0]).toMatchObject({ label: "Replaces", value: "Claude Haiku 4.5" });
    expect(facts[0].detail).toMatch(/^YES/);
    expect(facts[1].value).toBe("3.4x faster, 28x cheaper vs Haiku 4.5");
  });

  test("formats millisecond and second latencies, and a per-run cost", () => {
    expect(projectFacts(trader)[0]).toMatchObject({ kind: "speed", value: "81 ms" });
    expect(projectFacts(ultrafast).map((fact) => [fact.kind, fact.value])).toEqual([
      ["speed", "7.1 s"],
      ["cost", "$0.0039"],
    ]);
  });

  test("keeps string latencies such as '<1' as written", () => {
    expect(projectFacts(sglang).find((fact) => fact.kind === "speed")?.value).toBe("<1 s");
  });

  test("says 'a paid tool' when a verdict has no named tool", () => {
    const project = makeProject({ replaces: { tool: null, verdict: "KINDA", notes: "close" } });

    expect(primaryFact(project)).toMatchObject({ value: "a paid tool", detail: "KINDA · close" });
  });

  test("a project with no evidence has no facts, and never shows an invented one", () => {
    expect(projectFacts(cli)).toEqual([]);
    expect(primaryFact(fsd)).toBeNull();
  });

  test("ignores blank cost text", () => {
    expect(projectFacts(makeProject({ cost_signal: { basis: "   " } }))).toEqual([]);
  });
});

describe("evidenceScore", () => {
  test("ranks a strong verdict with numbers above a bare project", () => {
    expect(evidenceScore(guard)).toBeGreaterThan(evidenceScore(cli));
    expect(evidenceScore(fsd)).toBe(0);
  });

  test("weighs YES above KINDA above NOT REALLY", () => {
    expect(evidenceScore(guard)).toBeGreaterThan(evidenceScore(sglang));
    expect(evidenceScore(sglang)).toBeGreaterThan(evidenceScore(jeven));
  });

  test("counts only what can be shown: blank cost text and an empty benchmark add nothing", () => {
    expect(evidenceScore(makeProject({ cost_signal: { basis: "   " } }))).toBe(0);
    expect(evidenceScore(makeProject({ benchmark: { notes: "no figures" } }))).toBe(0);
  });
});

describe("hasNumbers", () => {
  test("is true for a latency, a comparison or a per-run cost", () => {
    expect(hasNumbers(trader)).toBe(true);
    expect(hasNumbers(guard)).toBe(true);
    expect(hasNumbers(makeProject({ benchmark: { cost_usd: 0.5 } }))).toBe(true);
  });

  test("is false for a benchmark object with no figures, and for cost text alone", () => {
    expect(hasNumbers(makeProject({ benchmark: { task: "something" } }))).toBe(false);
    expect(hasNumbers(makeProject({ cost_signal: { basis: "about $2 total" } }))).toBe(false);
    expect(hasNumbers(fsd)).toBe(false);
  });
});

describe("installCommand", () => {
  test("prefers the recipe's install command", () => {
    expect(installCommand(cli)).toBe("npm install -g ai-cli");
  });

  test("uses a command hiding in the website field, but never a URL", () => {
    expect(installCommand(gate)).toBe("npx pkg-gate <pkg>");
    expect(installCommand(makeProject({ website: "https://example.com" }))).toBeNull();
    expect(installCommand(makeProject({ website: "just some words" }))).toBeNull();
  });

  test("returns null with nothing to run", () => {
    expect(installCommand(fsd)).toBeNull();
  });
});

describe("categoryGroup", () => {
  test("keeps the part before the slash", () => {
    expect(categoryGroup(makeProject({ category: "dev tooling / CLI" }))).toBe("dev tooling");
  });
});
