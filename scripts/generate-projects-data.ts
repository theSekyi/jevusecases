import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ENTRIES_DIR = join(import.meta.dirname, "../src/data/entries");
export const OUTPUT_PATH = join(import.meta.dirname, "../src/data/projects.json");

export interface RawEntry {
  id: string;
  date_found: string;
  [key: string]: unknown;
}

/** Reads and validates one entry file's structure (valid JSON, a single object, id matches its folder). */
export function readEntry(entriesDir: string, dirName: string): RawEntry {
  const entryPath = join(entriesDir, dirName, "entry.json");

  let raw: string;
  try {
    raw = readFileSync(entryPath, "utf-8");
  } catch {
    throw new Error(`Missing entry.json in src/data/entries/${dirName}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in src/data/entries/${dirName}/entry.json: ${(error as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`src/data/entries/${dirName}/entry.json must contain a single JSON object`);
  }
  const entry = parsed as RawEntry;
  if (entry.id !== dirName) {
    throw new Error(
      `src/data/entries/${dirName}/entry.json has id "${entry.id}", which doesn't match its folder name`,
    );
  }
  return entry;
}

/** Lists entry folder names, rejecting any stray file sitting directly in the entries directory. */
export function listEntryDirs(entriesDir: string): string[] {
  const items = readdirSync(entriesDir, { withFileTypes: true });
  const stray = items.find((item) => !item.isDirectory());
  if (stray) {
    throw new Error(
      `src/data/entries/${stray.name} isn't a folder. Every entry needs its own folder ` +
        `(src/data/entries/<id>/entry.json), not a file directly under src/data/entries/.`,
    );
  }
  return items.map((item) => item.name);
}

/** Newest date_found first; same-day entries fall back to id order since date_found has no finer resolution. */
export function sortEntries(entries: RawEntry[]): RawEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date_found !== b.date_found) {
      return a.date_found < b.date_found ? 1 : -1;
    }
    return a.id < b.id ? -1 : 1;
  });
}

export function main() {
  if (!statSync(ENTRIES_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Entries directory not found: ${ENTRIES_DIR}`);
  }

  const dirNames = listEntryDirs(ENTRIES_DIR);
  const entries = sortEntries(dirNames.map((dirName) => readEntry(ENTRIES_DIR, dirName)));

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`Generated src/data/projects.json from ${entries.length} entries.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
