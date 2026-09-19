import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { projectFacts } from "../projectFacts";
import { sourceLink, type Project } from "../projects";
import { matchesLens } from "../lenses";
import { projectSchema } from "../projectSchema";

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

  test("is a valid entry, field for field", () => {
    expect(() => projectSchema.parse(parseTemplate())).not.toThrow();
  });

  test("a filled-in copy of the template runs through the real card-rendering functions without throwing", () => {
    const template = parseTemplate() as Project;

    expect(() => sourceLink(template)).not.toThrow();
    expect(() => projectFacts(template)).not.toThrow();
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
