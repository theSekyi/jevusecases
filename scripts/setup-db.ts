import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS visitor_events (
      id BIGSERIAL PRIMARY KEY,
      country TEXT,
      path TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS visitor_events_created_at_idx ON visitor_events (created_at DESC)
  `;
  console.log("visitor_events table ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
