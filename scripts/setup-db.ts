import { db } from "../src/lib/db.ts";

async function main() {
  const sql = db();

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
  await sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
      password_hash TEXT NOT NULL,
      using_temp_password BOOLEAN NOT NULL DEFAULT true,
      credential_version BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS admin_sessions_user_id_idx ON admin_sessions (user_id)
  `;
  console.log("visitor_events, admin_users, and admin_sessions tables ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
