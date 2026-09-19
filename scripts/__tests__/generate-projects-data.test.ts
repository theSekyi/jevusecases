import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeProject } from "../../src/lib/__tests__/fixtures";
import { listEntryDirs, readEntry, sortEntries } from "../generate-projects-data";

let dir: string;

/** Writes a valid entry into a folder named after its id, with `fields` changed or (when undefined) removed. */
function writeEntry(id: string, fields: Record<string, unknown> = {}, folder = id) {
  const entryDir = join(dir, folder);
  mkdirSync(entryDir, { recursive: true });
  writeFileSync(join(entryDir, "entry.json"), JSON.stringify({ ...makeProject({ id }), ...fields }));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jevusecases-entries-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readEntry", () => {
  test("reads a valid entry.json", () => {
    writeEntry("acme-widget", { project: "Widget" });
    expect(readEntry(dir, "acme-widget")).toEqual(makeProject({ id: "acme-widget", project: "Widget" }));
  });

  test("names the folder and the field when an entry breaks the schema", () => {
    const broken: [string, Record<string, unknown>][] = [
      ["description", { description: undefined }],
      ["is_build", { is_build: "yes" }],
      ["category", { category: "not a real category" }],
      ["author", { author: "Jane Doe" }],
      ["github", { github: "https://gitlab.com/acme/widget" }],
      ["stars", { stars: 12 }],
    ];
    for (const [field, fields] of broken) {
      writeEntry("acme-widget", fields);
      expect(() => readEntry(dir, "acme-widget"), field).toThrow(new RegExp(`acme-widget[\\s\\S]*${field}`));
    }
  });

  test("rejects a date_found that isn't a real YYYY-MM-DD date, so a bad entry can't reach the site", () => {
    for (const bad of ["2026-9-7", "2026-02-30", "17/09/2026", "", "yesterday"]) {
      writeEntry("bad-date", { date_found: bad });
      expect(() => readEntry(dir, "bad-date"), bad).toThrow(/date_found/);
    }
    writeEntry("no-date", { date_found: undefined });
    expect(() => readEntry(dir, "no-date")).toThrow(/date_found/);
  });

  test("throws with the folder name when entry.json is missing", () => {
    mkdirSync(join(dir, "empty-folder"));
    expect(() => readEntry(dir, "empty-folder")).toThrow(/Missing entry\.json.*empty-folder/);
  });

  test("throws with the folder name when entry.json isn't valid JSON", () => {
    mkdirSync(join(dir, "bad-json"));
    writeFileSync(join(dir, "bad-json", "entry.json"), "{ not json");
    expect(() => readEntry(dir, "bad-json")).toThrow(/Invalid JSON.*bad-json/);
  });

  test("throws when entry.json is an array instead of an object", () => {
    mkdirSync(join(dir, "an-array"));
    writeFileSync(join(dir, "an-array", "entry.json"), "[]");
    expect(() => readEntry(dir, "an-array")).toThrow(/must contain a single JSON object/);
  });

  test("throws when the entry's id doesn't match its folder name", () => {
    writeEntry("real-name", {}, "wrong-folder");
    expect(() => readEntry(dir, "wrong-folder")).toThrow(/doesn't match its folder name/);
  });
});

describe("listEntryDirs", () => {
  test("lists every folder under the entries directory", () => {
    mkdirSync(join(dir, "one"));
    mkdirSync(join(dir, "two"));
    expect(listEntryDirs(dir).sort()).toEqual(["one", "two"]);
  });

  test("rejects a stray file sitting directly under the entries directory", () => {
    mkdirSync(join(dir, "one"));
    writeFileSync(join(dir, "stray.json"), "{}");
    expect(() => listEntryDirs(dir)).toThrow(/stray\.json.*isn't a folder/);
  });
});

describe("sortEntries", () => {
  test("sorts by date_found, newest first", () => {
    const entries = [
      makeProject({ id: "old", date_found: "2026-01-01" }),
      makeProject({ id: "new", date_found: "2026-06-01" }),
      makeProject({ id: "mid", date_found: "2026-03-01" }),
    ];
    expect(sortEntries(entries).map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  test("breaks a same-day tie by id, deterministically", () => {
    const entries = [
      makeProject({ id: "zzz", date_found: "2026-01-01" }),
      makeProject({ id: "aaa", date_found: "2026-01-01" }),
    ];
    expect(sortEntries(entries).map((e) => e.id)).toEqual(["aaa", "zzz"]);
  });

  test("doesn't mutate the input array", () => {
    const entries = [
      makeProject({ id: "b", date_found: "2026-01-01" }),
      makeProject({ id: "a", date_found: "2026-02-01" }),
    ];
    sortEntries(entries);
    expect(entries.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
