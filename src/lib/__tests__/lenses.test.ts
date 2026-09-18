import { describe, expect, test } from "vitest";
import { getProjects } from "../projects";
import { matchesLens } from "../lenses";

describe("matchesLens", () => {
  const projects = getProjects();

  test("all matches every project", () => {
    expect(projects.every((p) => matchesLens(p, "all"))).toBe(true);
  });

  test("replace matches only projects with a verdict", () => {
    const matched = projects.filter((p) => matchesLens(p, "replace"));
    expect(matched.map((p) => p.id).sort()).toEqual(
      ["leepokai-jev-guard", "wobsoriano-is-jeven", "ekzhang-openjev-sglang"].sort(),
    );
  });

  test("benchmark matches only projects with a benchmark object", () => {
    const matched = projects.filter((p) => matchesLens(p, "benchmark"));
    expect(matched.map((p) => p.id).sort()).toEqual(
      [
        "jarrodwatts-jev-trader",
        "gregpr07-jev-ultrafast",
        "lazyide-the-lazyide",
        "leepokai-jev-guard",
        "ekzhang-openjev-sglang",
        "gnumanth-pkg-gate",
      ].sort(),
    );
  });

  test("cookbook matches only projects with a recipe", () => {
    const matched = projects.filter((p) => matchesLens(p, "cookbook"));
    expect(matched.length).toBe(10);
  });
});
