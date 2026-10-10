import { Client } from "pg";
import { readFile } from "node:fs/promises";

// Full replacement also reconciles updates and privacy deletions, rather than replaying only new IDs.
// Run only while BOTH hosts are write-disabled. Sessions are revoked during rollback.
export async function restoreNeon(connection: string, file: string): Promise<void> {
  const results = JSON.parse(await readFile(file, "utf8")) as { results: Record<string, unknown>[] }[];
  if (results.length !== 4) throw new Error("Expected an ordered four-table D1 export");
  const users = results[2].results.filter(row => row.access_enabled !== 0);
  const client = new Client({ connectionString: connection });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM admin_sessions; DELETE FROM admin_users; DELETE FROM visitor_events; DELETE FROM link_clicks");
    await client.query(`INSERT INTO admin_users(id,email,password_hash,using_temp_password,credential_version,created_at)
      SELECT id,email,password_hash,using_temp_password=1,credential_version,
        'epoch'::timestamptz + ((created_at / 1000000)::text || ' seconds')::interval
      FROM jsonb_to_recordset($1::jsonb)
        AS r(id bigint,email text,password_hash text,using_temp_password int,credential_version bigint,created_at numeric)`, [JSON.stringify(users)]);
    await client.query(`INSERT INTO visitor_events(id,country,path,created_at,visitor_hash,ref,referrer_host)
      SELECT id,country,path,'epoch'::timestamptz + ((created_at / 1000000)::text || ' seconds')::interval,visitor_hash,ref,referrer_host
      FROM jsonb_to_recordset($1::jsonb)
        AS r(id bigint,country text,path text,created_at numeric,visitor_hash text,ref text,referrer_host text)`, [JSON.stringify(results[0].results)]);
    await client.query(`INSERT INTO link_clicks(id,created_at,visitor_hash,kind,project_id,host,path)
      SELECT id,'epoch'::timestamptz + ((created_at / 1000000)::text || ' seconds')::interval,visitor_hash,kind,project_id,host,path
      FROM jsonb_to_recordset($1::jsonb)
        AS r(id bigint,created_at numeric,visitor_hash text,kind text,project_id text,host text,path text)`, [JSON.stringify(results[1].results)]);
    for (const table of ["visitor_events", "link_clicks", "admin_users"]) {
      const { rows: [{ next_id }] } = await client.query(`SELECT coalesce(max(id),0)+1 AS next_id FROM ${table}`);
      if (!/^\d+$/.test(next_id)) throw new Error("Invalid next sequence ID");
      // ALTER SEQUENCE participates in this transaction, unlike setval(). The identifiers are fixed above.
      await client.query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH ${next_id}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
  console.log("Restored current D1 users and analytics atomically; revoked legacy sessions. Writes must stay paused until verification.");
}

if (process.argv[1]?.endsWith("restore-neon.ts")) {
  const [file, confirmation] = process.argv.slice(2);
  if (!file || confirmation !== "--both-hosts-write-disabled" || !process.env.DATABASE_URL) {
    throw new Error("Usage: restore-neon.ts <private-D1-export> --both-hosts-write-disabled; DATABASE_URL is required");
  }
  await restoreNeon(process.env.DATABASE_URL, file);
}
