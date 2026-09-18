import { describe, expect, test } from "vitest";
import { matchesLens } from "../lenses";
import { FIXTURE_PROJECTS, cli, fsd, gate, guard, jeven, makeProject, trader } from "./fixtures";

const ids = (lens: Parameters<typeof matchesLens>[1]) =>
  FIXTURE_PROJECTS.filter((project) => matchesLens(project, lens)).map((project) => project.id);

describe("matchesLens", () => {
  test("all matches every project", () => {
    expect(ids("all")).toHaveLength(FIXTURE_PROJECTS.length);
  });

  test("replace matches only projects with a verdict", () => {
    expect(ids("replace").sort()).toEqual(["guard", "jeven", "sglang"]);
  });

  test("benchmark matches only projects with a measured figure", () => {
    expect(ids("benchmark").sort()).toEqual(["gate", "guard", "sglang", "trader", "ultrafast"]);
    expect(matchesLens(makeProject({ benchmark: { task: "no figures" } }), "benchmark")).toBe(false);
  });

  test("cookbook matches only projects with a recipe", () => {
    expect(ids("cookbook").sort()).toEqual(["cli", "gate", "guard", "jeven", "sglang", "trader", "ultrafast"]);
    expect(matchesLens(fsd, "cookbook")).toBe(false);
  });

  test("a project can sit in several lenses", () => {
    expect([guard, trader, gate, cli, jeven].map((project) => matchesLens(project, "cookbook"))).toEqual([true, true, true, true, true]);
    expect(matchesLens(guard, "replace") && matchesLens(guard, "benchmark")).toBe(true);
  });
});
