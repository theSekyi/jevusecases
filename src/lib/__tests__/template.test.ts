import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cardStat, sourceLink, type Project } from "../projects";
import { matchesLens } from "../lenses";

/** TEMPLATE.jsonc is documentation with comments; strip whole-line `//` comments to get real JSON. */
function parseTemplate(): unknown {
  const raw = readFileSync(join(__dirname, "../../../TEMPLATE.jsonc"), "utf-8");
  const withoutComments = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return JSON.parse(withoutComments);
}

describe("TEMPLATE.jsonc", () => {
  test("is valid JSON once comments are stripped", () => {
    expect(() => parseTemplate()).not.toThrow();
  });

  test("has exactly the fields the real Project schema expects, nothing more or less", () => {
    const template = parseTemplate() as Record<string, unknown>;
    const expectedFields: (keyof Project)[] = [
      "id",
      "project",
      "description",
      "github",
      "website",
      "how_used_jev",
      "source_tweet",
      "author",
      "date_found",
      "is_build",
      "category",
      "replaces",
      "cost_signal",
      "benchmark",
      "jaggedness_reports",
      "security_status",
      "recipe",
    ];

    expect(Object.keys(template).sort()).toEqual([...expectedFields].sort());
  });

  test("a filled-in copy of the template runs through the real card-rendering functions without throwing", () => {
    const template = parseTemplate() as Project;

    expect(() => sourceLink(template)).not.toThrow();
    expect(() => cardStat(template)).not.toThrow();
    expect(() => matchesLens(template, "all")).not.toThrow();
    expect(() => matchesLens(template, "replace")).not.toThrow();
    expect(() => matchesLens(template, "benchmark")).not.toThrow();
    expect(() => matchesLens(template, "cookbook")).not.toThrow();

    // The template's own placeholder values should resolve to a real source link.
    expect(sourceLink(template)).toEqual({
      href: "https://github.com/yourhandle/your-project",
      label: "github.com/yourhandle/your-project",
    });
  });
});
