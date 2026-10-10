import { getCloudflareContext } from "@opennextjs/cloudflare";

export function usesD1(): boolean {
  return process.env.DATABASE_PROVIDER === "d1";
}

export function usesAccess(): boolean {
  return process.env.AUTH_PROVIDER === "cloudflare-access";
}

export function cloudflareCountry(): string | undefined {
  return getCloudflareContext().cf?.country as string | undefined;
}

export interface DatabaseStatement {
  bind(...values: (string | number | null)[]): DatabaseStatement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface DatabaseBinding {
  prepare(query: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<{ results: Record<string, unknown>[]; meta: { changes: number } }[]>;
}

declare global {
  interface CloudflareEnv {
    DB: DatabaseBinding;
  }
}

export function databaseBinding(): DatabaseBinding {
  const database = getCloudflareContext().env.DB;
  if (!database) throw new Error("D1 binding DB is not configured");
  return database;
}
