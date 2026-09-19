import { describe, expect, test } from "vitest";
import {
  ALL_CATEGORIES,
  DEFAULT_FILTERS,
  categoryOptions,
  featuredProject,
  filterProjects,
  isDefaultView,
  lensCounts,
  matchesQuery,
  sortProjects,
} from "../projectSearch";
import { FIXTURE_PROJECTS, cli, fsd, gate, guard, makeProject, trader } from "./fixtures";

const ids = (list: { id: string }[]) => list.map((project) => project.id);

describe("matchesQuery", () => {
  test("matches on name, description, category, author and the tool it replaced, ignoring case", () => {
    expect(matchesQuery(guard, "JEV-GUARD")).toBe(true);
    expect(matchesQuery(guard, "classifier")).toBe(true);
    expect(matchesQuery(guard, "guardrails")).toBe(true);
    expect(matchesQuery(guard, "guardian")).toBe(true);
    expect(matchesQuery(guard, "haiku")).toBe(true);
  });

  test("finds what the cards show: figures, comparisons, tasks and install commands", () => {
    expect(matchesQuery(guard, "faster")).toBe(true);
    expect(matchesQuery(trader, "81 ms")).toBe(true);
    expect(matchesQuery(trader, "decision per block")).toBe(true);
    expect(matchesQuery(cli, "npm")).toBe(true);
    expect(matchesQuery(gate, "npx")).toBe(true);
  });

  test("needs every word, in any order", () => {
    expect(matchesQuery(guard, "haiku classifier")).toBe(true);
    expect(matchesQuery(guard, "classifier haiku")).toBe(true);
    expect(matchesQuery(guard, "haiku flights")).toBe(false);
  });

  test("an empty or blank query matches everything", () => {
    expect(matchesQuery(guard, "")).toBe(true);
    expect(matchesQuery(guard, "   ")).toBe(true);
  });

  test("copes with regex characters instead of treating them as a pattern", () => {
    expect(matchesQuery(guard, "[")).toBe(false);
    expect(matchesQuery(guard, "h.*u")).toBe(false);
  });
});

describe("filterProjects", () => {
  test("no filters returns everything", () => {
    expect(filterProjects(FIXTURE_PROJECTS, DEFAULT_FILTERS)).toHaveLength(FIXTURE_PROJECTS.length);
  });

  test("combines search, lens and category", () => {
    const result = filterProjects(FIXTURE_PROJECTS, { query: "", lens: "replace", category: "security" });
    expect(ids(result)).toEqual(["guard"]);
  });

  test("the lens keeps only what it names", () => {
    expect(filterProjects(FIXTURE_PROJECTS, { ...DEFAULT_FILTERS, lens: "replace" })).toHaveLength(3);
    expect(filterProjects(FIXTURE_PROJECTS, { ...DEFAULT_FILTERS, lens: "benchmark" })).toHaveLength(5);
  });

  test("returns nothing, not an error, when nothing matches", () => {
    expect(filterProjects(FIXTURE_PROJECTS, { ...DEFAULT_FILTERS, query: "zzzz-no-such-thing" })).toEqual([]);
  });
});

describe("sortProjects", () => {
  test("most evidence puts the strongest first, ties by newest then name, and does not change the input", () => {
    const original = [...FIXTURE_PROJECTS];

    expect(ids(sortProjects(FIXTURE_PROJECTS, "evidence"))).toEqual([
      "guard",
      "sglang",
      "ultrafast",
      "trader",
      "gate",
      "jeven",
      "cli",
      "fsd",
    ]);
    expect(FIXTURE_PROJECTS).toEqual(original);
  });

  test("a newer project wins an evidence tie", () => {
    const older = makeProject({ id: "older", project: "A", date_found: "2026-01-01" });
    const newer = makeProject({ id: "newer", project: "B", date_found: "2026-02-01" });

    expect(ids(sortProjects([older, newer], "evidence"))).toEqual(["newer", "older"]);
  });

  test("A to Z sorts by name", () => {
    const names = sortProjects(FIXTURE_PROJECTS, "az").map((project) => project.project);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("newest puts later dates first, with ties broken by name", () => {
    const list = [
      makeProject({ id: "a", project: "B", date_found: "2026-01-01" }),
      makeProject({ id: "b", project: "A", date_found: "2026-02-01" }),
      makeProject({ id: "c", project: "C", date_found: "2026-02-01" }),
    ];
    expect(ids(sortProjects(list, "newest"))).toEqual(["b", "c", "a"]);
  });
});

describe("lensCounts", () => {
  test("counts what each lens would show, given the search and category", () => {
    expect(lensCounts(FIXTURE_PROJECTS, { query: "", category: ALL_CATEGORIES })).toEqual({
      all: 8,
      replace: 3,
      benchmark: 5,
      cookbook: 7,
    });

    const security = lensCounts(FIXTURE_PROJECTS, { query: "", category: "security" });
    expect(security).toEqual({ all: 2, replace: 1, benchmark: 2, cookbook: 2 });
  });
});

describe("categoryOptions", () => {
  test("lists each category once, biggest first, with counts that add up", () => {
    const options = categoryOptions(FIXTURE_PROJECTS);

    expect(options[0]).toEqual({ value: "security", label: "Security", count: 2 });
    expect(options.reduce((sum, option) => sum + option.count, 0)).toBe(FIXTURE_PROJECTS.length);
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
  });
});

describe("featuredProject / isDefaultView", () => {
  test("features the project with the most evidence", () => {
    expect(featuredProject(FIXTURE_PROJECTS)?.id).toBe("guard");
  });

  test("features nothing when no project has any evidence, even if one has a recipe", () => {
    expect(featuredProject([cli, fsd])).toBeNull();
    expect(featuredProject([])).toBeNull();
  });

  test("skips a top scorer with nothing to show and features the next that has evidence", () => {
    const factless = makeProject({ id: "factless", project: "Z", recipe: { type: "a" }, cost_signal: { basis: " " } });
    expect(featuredProject([factless, trader])?.id).toBe("trader");
  });

  test("only the untouched view counts as the default view", () => {
    expect(isDefaultView(DEFAULT_FILTERS, "evidence")).toBe(true);
    expect(isDefaultView({ ...DEFAULT_FILTERS, query: "x" }, "evidence")).toBe(false);
    expect(isDefaultView({ ...DEFAULT_FILTERS, lens: "replace" }, "evidence")).toBe(false);
    expect(isDefaultView({ ...DEFAULT_FILTERS, category: "security" }, "evidence")).toBe(false);
    expect(isDefaultView(DEFAULT_FILTERS, "az")).toBe(false);
    expect(isDefaultView({ ...DEFAULT_FILTERS, query: "  " }, "evidence")).toBe(true);
  });
});
