import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tables = ["visitor_events", "link_clicks", "admin_users", "admin_sessions"] as const;
const columns = {
  visitor_events: ["id", "country", "path", "created_at", "visitor_hash", "ref", "referrer_host"],
  link_clicks: ["id", "created_at", "visitor_hash", "kind", "project_id", "host", "path"],
  admin_users: ["id", "email", "password_hash", "using_temp_password", "credential_version", "created_at"],
  admin_sessions: ["token_hash", "user_id", "created_at", "expires_at"],
};
type Table = typeof tables[number];
type Row = Record<string, string | number | boolean | null>;
interface Snapshot { capturedAt: string; tables: Record<Table, Row[]> }

const integerFields = new Set(["id", "user_id", "credential_version", "created_at", "expires_at"]);
function integer(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Unsafe integer in migration input");
  return parsed;
}
function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(integer(value));
  if (typeof value !== "string" || value.includes("\0")) throw new Error("Unsupported SQL input");
  return `'${value.replaceAll("'", "''")}'`;
}
export function canonicalRows(table: Table, rows: Row[]): string {
  return JSON.stringify(rows.map(row => columns[table].map(column => {
    const value = row[column];
    if (column === "using_temp_password") return value === true || value === 1;
    return value !== null && integerFields.has(column) ? integer(value as string | number) : value;
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function exportSnapshot(directory: string): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const sql = neon(process.env.DATABASE_URL);
  const result = await sql.transaction(tables.map(table => sql.query(
    `SELECT ${columns[table].map(column => column === "created_at" || column === "expires_at"
      ? `(extract(epoch FROM ${column}) * 1000000)::bigint::text AS ${column}`
      : integerFields.has(column) ? `${column}::text AS ${column}` : column).join(",")}
      FROM ${table} ORDER BY ${table === "admin_sessions" ? "token_hash" : "id"}`)),
  { isolationLevel: "RepeatableRead", readOnly: true });
  const snapshot: Snapshot = { capturedAt: new Date().toISOString(), tables: Object.fromEntries(tables.map((table, i) => [table, result[i]])) as Snapshot["tables"] };
  const serialized = JSON.stringify(snapshot);
  await writeFile(resolve(directory, "snapshot.json"), serialized, { mode: 0o600, flag: "wx" });
  await writeFile(resolve(directory, "manifest.json"), JSON.stringify({ capturedAt: snapshot.capturedAt, sha256: digest(serialized),
    tables: Object.fromEntries(tables.map(table => [table, { rows: snapshot.tables[table].length, sha256: digest(canonicalRows(table, snapshot.tables[table])) }])) }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ capturedAt: snapshot.capturedAt, counts: Object.fromEntries(tables.map(table => [table, snapshot.tables[table].length])) }));
}

export async function createImport(directory: string): Promise<void> {
  const serialized = await readFile(resolve(directory, "snapshot.json"), "utf8");
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  if (digest(serialized) !== manifest.sha256) throw new Error("Snapshot checksum mismatch");
  const snapshot = JSON.parse(serialized) as Snapshot;
  const statements: string[] = [];
  // The target must be empty. Conflicting rows stop import; no INSERT OR IGNORE masks corruption.
  for (const table of ["admin_users", "admin_sessions", "visitor_events", "link_clicks"] as Table[]) {
    for (const row of snapshot.tables[table]) {
      const values = columns[table].map(column => integerFields.has(column) && row[column] !== null
        ? literal(integer(row[column] as string | number)) : literal(row[column]));
      statements.push(`INSERT INTO ${table}(${columns[table].join(",")}) VALUES (${values.join(",")});`);
    }
  }
  await writeFile(resolve(directory, "import.sql"), statements.join("\n"), { mode: 0o600 });
  console.log("Verified snapshot and created D1 import. Legacy sessions are retained for recovery, but Access ignores them.");
}

export async function verifyImport(directory: string): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  const results = JSON.parse(await readFile(resolve(directory, "d1-records.json"), "utf8")) as { results: Row[] }[];
  if (results.length !== tables.length) throw new Error("Unexpected D1 export shape");
  for (const [i, table] of tables.entries()) {
    const rows = results[i].results;
    if (rows.length !== manifest.tables[table].rows || digest(canonicalRows(table, rows)) !== manifest.tables[table].sha256) {
      throw new Error(`Reconciliation failed for ${table}`);
    }
  }
  await writeFile(resolve(directory, "reconciliation.json"), JSON.stringify({ verifiedAt: new Date().toISOString(),
    counts: Object.fromEntries(tables.map((table, i) => [table, results[i].results.length])), matched: true }, null, 2), { mode: 0o600 });
  console.log("All four table counts and canonical record checksums match.");
}

if (process.argv[1]?.endsWith("migration-data.ts")) {
  const [operation, directory] = process.argv.slice(2);
  if (!directory || !["snapshot", "convert", "verify"].includes(operation)) throw new Error("Usage: migration-data.ts snapshot|convert|verify <private-directory>");
  await (operation === "snapshot" ? exportSnapshot(directory) : operation === "convert" ? createImport(directory) : verifyImport(directory));
}
