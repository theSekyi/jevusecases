import { neon } from "@neondatabase/serverless";

/** A one-off HTTP-based Postgres client — no persistent connection, safe to call from Middleware/Edge. */
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return neon(url);
}
