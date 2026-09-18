import { describe, expect, test } from "vitest";
import { getProjects, sourceLink } from "../projects";

describe("getProjects", () => {
  test("excludes non-build entries like curation threads", () => {
    const projects = getProjects();
    expect(projects.find((p) => p.id === "moritzkremb-explainer-thread")).toBeUndefined();
  });

  test("returns only real builds", () => {
    const projects = getProjects();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.is_build)).toBe(true);
  });
});

describe("sourceLink", () => {
  test("prefers a real github link", () => {
    const project = getProjects().find((p) => p.id === "jarrodwatts-jev-trader")!;
    expect(sourceLink(project)).toEqual({
      href: "https://github.com/jarrodwatts/jev-trader",
      label: "github.com/jarrodwatts/jev-trader",
    });
  });

  test("returns null when there's no real link, even if website is an npm install string", () => {
    const project = getProjects().find((p) => p.id === "ctatedev-ai-cli")!;
    expect(sourceLink(project)).toBeNull();
  });
});
