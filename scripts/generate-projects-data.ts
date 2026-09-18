import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENTRIES_DIR = join(import.meta.dirname, "../src/data/entries");
const OUTPUT_PATH = join(import.meta.dirname, "../src/data/projects.json");

interface RawEntry {
  id: string;
  date_found: string;
  [key: string]: unknown;
}

function readEntry(dirName: string): RawEntry {
  const entryPath = join(ENTRIES_DIR, dirName, "entry.json");
  if (!existsSync(entryPath)) {
    throw new Error(`Missing entry.json in src/data/entries/${dirName}`);
  }

  const raw = readFileSync(entryPath, "utf-8");
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

function main() {
  if (!existsSync(ENTRIES_DIR)) {
    throw new Error(`Entries directory not found: ${ENTRIES_DIR}`);
  }

  const dirNames = readdirSync(ENTRIES_DIR, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  const entries = dirNames.map(readEntry);

  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate id across entry files: ${entry.id}`);
    }
    seenIds.add(entry.id);
  }

  entries.sort((a, b) => {
    if (a.date_found !== b.date_found) {
      return a.date_found < b.date_found ? 1 : -1; // newest date_found first
    }
    return a.id < b.id ? -1 : 1; // stable tiebreak
  });

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`Generated src/data/projects.json from ${entries.length} entries.`);
}

main();
