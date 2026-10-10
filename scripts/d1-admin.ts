import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeIp } from "../src/lib/rateLimit.ts";
import { hashVisitor } from "../src/lib/visitorHash.ts";
import { emailSchema } from "../src/lib/authSchema.ts";

const [operation, value, target] = process.argv.slice(2);
if (!["invite", "revoke", "lookup", "delete-visitor"].includes(operation) || !value || !["preview", "production"].includes(target)) {
  throw new Error("Usage: d1-admin.ts invite|revoke|lookup|delete-visitor <email-or-ip> preview|production");
}
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
let query: string;
if (operation === "invite" || operation === "revoke") {
  const email = quote(emailSchema.parse(value));
  query = operation === "invite"
    ? `INSERT INTO admin_users(email,password_hash,using_temp_password,created_at) VALUES (${email},'',0,${Date.now() * 1000});`
    : `UPDATE admin_users SET access_enabled=0,credential_version=credential_version+1 WHERE email=${email}; DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM admin_users WHERE email=${email});`;
} else {
  if (!/^[0-9a-fA-F:.]+(%[\w.-]+)?$/.test(value) || !/[.:]/.test(value)) throw new Error("Invalid IP address");
  const secret = process.env.VISITOR_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("The unchanged visitor hash secret is required");
  const hash = quote(hashVisitor(normalizeIp(value))!);
  query = operation === "lookup"
    ? `SELECT count(*) AS views,min(created_at) AS first_seen,max(created_at) AS last_seen FROM visitor_events WHERE visitor_hash=${hash}; SELECT count(*) AS clicks FROM link_clicks WHERE visitor_hash=${hash};`
    : `DELETE FROM visitor_events WHERE visitor_hash=${hash}; DELETE FROM link_clicks WHERE visitor_hash=${hash};`;
}
const directory = mkdtempSync(join(tmpdir(), "jev-d1-admin-"));
try {
  const file = join(directory, "operation.sql");
  writeFileSync(file, query, { mode: 0o600 });
  execFileSync("npx", ["wrangler", "d1", "execute", `jevusecases-${target}`, "--config", target === "production" ? "wrangler.production.jsonc" : "wrangler.jsonc", "--remote", "--file", file], { stdio: "inherit" });
} finally { rmSync(directory, { recursive: true }); }
