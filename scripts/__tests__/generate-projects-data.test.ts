import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listEntryDirs, readEntry, sortEntries, type RawEntry } from "../generate-projects-data";

let dir: string;

function writeEntry(id: string, fields: Record<string, unknown> = {}) {
  const entryDir = join(dir, id);
  mkdirSync(entryDir, { recursive: true });
  writeFileSync(join(entryDir, "entry.json"), JSON.stringify({ id, ...fields }));
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
    expect(readEntry(dir, "acme-widget")).toEqual({ id: "acme-widget", project: "Widget" });
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
    writeEntry("real-name", {});
    mkdirSync(join(dir, "wrong-folder"));
    writeFileSync(join(dir, "wrong-folder", "entry.json"), JSON.stringify({ id: "real-name" }));
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
    const entries: RawEntry[] = [
      { id: "old", date_found: "2026-01-01" },
      { id: "new", date_found: "2026-06-01" },
      { id: "mid", date_found: "2026-03-01" },
    ];
    expect(sortEntries(entries).map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  test("breaks a same-day tie by id, deterministically", () => {
    const entries: RawEntry[] = [
      { id: "zzz", date_found: "2026-01-01" },
      { id: "aaa", date_found: "2026-01-01" },
    ];
    expect(sortEntries(entries).map((e) => e.id)).toEqual(["aaa", "zzz"]);
  });

  test("doesn't mutate the input array", () => {
    const entries: RawEntry[] = [
      { id: "b", date_found: "2026-01-01" },
      { id: "a", date_found: "2026-02-01" },
    ];
    sortEntries(entries);
    expect(entries.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
