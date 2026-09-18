import { describe, expect, test } from "vitest";
import { cardStat, getProjects, sourceLink } from "../projects";

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

describe("cardStat", () => {
  test("prefers a replace verdict over a benchmark figure", () => {
    const project = getProjects().find((p) => p.id === "leepokai-jev-guard")!;
    expect(cardStat(project)).toBe("replaces Claude Haiku 4.5 (as a tool-call classifier) — YES");
  });

  test("formats a latency_ms benchmark", () => {
    const project = getProjects().find((p) => p.id === "jarrodwatts-jev-trader")!;
    expect(cardStat(project)).toBe("81ms");
  });

  test("formats a latency_s + cost_usd benchmark", () => {
    const project = getProjects().find((p) => p.id === "gregpr07-jev-ultrafast")!;
    expect(cardStat(project)).toBe("7.1s · $0.0039");
  });

  test("returns null when there's no verdict or benchmark", () => {
    const project = getProjects().find((p) => p.id === "jpschroeder-fsd-rebuild")!;
    expect(cardStat(project)).toBeNull();
  });
});
