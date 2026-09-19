import { describe, expect, test } from "vitest";
import { clip } from "../shareCard";
import { projectUrl } from "../site";

describe("clip", () => {
  test("leaves short text alone", () => {
    expect(clip("jev-guard", 20)).toBe("jev-guard");
  });

  test("cuts long text at a word and marks the cut", () => {
    const out = clip("Security classifier for coding-agent tool calls, rebuilt on Jev", 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/[ ,]…$/);
  });
});

describe("projectUrl", () => {
  test("points at the canonical host, with an optional ref tag", () => {
    expect(projectUrl("jev-guard")).toBe("https://www.jevusecases.com/p/jev-guard");
    expect(projectUrl("jev-guard", "x-post")).toBe("https://www.jevusecases.com/p/jev-guard?ref=x-post");
  });
});
