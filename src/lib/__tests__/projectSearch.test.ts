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
import { getProjects } from "../projects";

const projects = getProjects();
const ids = (list: { id: string }[]) => list.map((project) => project.id);

describe("matchesQuery", () => {
  const guard = projects.find((project) => project.id === "leepokai-jev-guard")!;

  test("matches on name, description, category, author and the tool it replaced, ignoring case", () => {
    expect(matchesQuery(guard, "JEV-GUARD")).toBe(true);
    expect(matchesQuery(guard, "classifier")).toBe(true);
    expect(matchesQuery(guard, "guardrails")).toBe(true);
    expect(matchesQuery(guard, "lbki34064963")).toBe(true);
    expect(matchesQuery(guard, "haiku")).toBe(true);
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
    expect(matchesQuery(guard, "(as")).toBe(true);
  });
});

describe("filterProjects", () => {
  test("no filters returns everything", () => {
    expect(filterProjects(projects, DEFAULT_FILTERS)).toHaveLength(projects.length);
  });

  test("combines search, lens and category", () => {
    const result = filterProjects(projects, { query: "", lens: "replace", category: "security" });
    expect(ids(result)).toEqual(["leepokai-jev-guard"]);
  });

  test("the lens keeps only what it names", () => {
    expect(filterProjects(projects, { ...DEFAULT_FILTERS, lens: "replace" })).toHaveLength(3);
    expect(filterProjects(projects, { ...DEFAULT_FILTERS, lens: "benchmark" })).toHaveLength(6);
  });

  test("returns nothing, not an error, when nothing matches", () => {
    expect(filterProjects(projects, { ...DEFAULT_FILTERS, query: "zzzz-no-such-thing" })).toEqual([]);
  });
});

describe("sortProjects", () => {
  test("most evidence puts the strongest first and does not change the input", () => {
    const original = [...projects];
    const sorted = sortProjects(projects, "evidence");

    expect(sorted[0].id).toBe("leepokai-jev-guard");
    expect(projects).toEqual(original);
  });

  test("A to Z sorts by name", () => {
    const names = sortProjects(projects, "az").map((project) => project.project);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("newest puts later dates first, with ties broken by name", () => {
    const list = [
      { ...projects[0], id: "a", project: "B", date_found: "2026-01-01" },
      { ...projects[0], id: "b", project: "A", date_found: "2026-02-01" },
      { ...projects[0], id: "c", project: "C", date_found: "2026-02-01" },
    ];
    expect(ids(sortProjects(list, "newest"))).toEqual(["b", "c", "a"]);
  });
});

describe("lensCounts", () => {
  test("counts what each lens would show, given the search and category", () => {
    const all = lensCounts(projects, { query: "", category: ALL_CATEGORIES });
    expect(all).toEqual({ all: 12, replace: 3, benchmark: 6, cookbook: 10 });

    const security = lensCounts(projects, { query: "", category: "security" });
    expect(security.all).toBe(3);
    expect(security.replace).toBe(1);
  });
});

describe("categoryOptions", () => {
  test("lists each category once, biggest first, with counts that add up", () => {
    const options = categoryOptions(projects);

    expect(options[0]).toEqual({ value: "security", label: "Security", count: 3 });
    expect(options.reduce((sum, option) => sum + option.count, 0)).toBe(projects.length);
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
  });
});

describe("featuredProject / isDefaultView", () => {
  test("features the project with the most evidence", () => {
    expect(featuredProject(projects)?.id).toBe("leepokai-jev-guard");
  });

  test("features nothing when no project has any evidence, even if one has a recipe", () => {
    const bare = projects.filter((project) => project.id === "ctatedev-ai-cli");
    expect(featuredProject(bare)).toBeNull();
    expect(featuredProject([])).toBeNull();
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
