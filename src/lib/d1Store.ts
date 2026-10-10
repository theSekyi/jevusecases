import type { DatabaseBinding } from "./cloudflare.ts";

type Value = string | number | null;
type Visit = { country: string | null; path: string; visitorHash: string | null; ref: string | null; referrerHost: string | null };
type Click = { kind: string; projectId: string | null; host: string | null; path: string | null; visitorHash: string };

// UTC epoch microseconds preserve PostgreSQL precision. Contemporary values are safe JS integers.
export const nowMicros = () => Date.now() * 1000;
export const isoMicros = (value: number) => new Date(value / 1000).toISOString();

/** The shared D1 persistence boundary. Single INSERT ... SELECT statements serialize deduplication. */
export class D1Store {
  constructor(private readonly database: DatabaseBinding) {}

  async query<T>(text: string, ...values: Value[]): Promise<T[]> {
    return (await this.database.prepare(text).bind(...values).all<T>()).results;
  }

  async recordVisit(visit: Visit, at = nowMicros()): Promise<void> {
    await this.query(`INSERT INTO visitor_events(country,path,visitor_hash,ref,referrer_host,created_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS (
        SELECT 1 FROM visitor_events WHERE created_at > ? AND
        ((? IS NOT NULL AND visitor_hash = ?) OR (? IS NULL AND visitor_hash IS NULL AND country IS ?)))`,
    visit.country, visit.path, visit.visitorHash, visit.ref, visit.referrerHost, at, at - 3_000_000,
    visit.visitorHash, visit.visitorHash, visit.visitorHash, visit.country);
  }

  async recordClick(click: Click, at = nowMicros()): Promise<void> {
    await this.query(`INSERT INTO link_clicks(visitor_hash,kind,project_id,host,path,created_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS (
        SELECT 1 FROM link_clicks WHERE created_at > ? AND visitor_hash = ? AND kind = ? AND project_id IS ?)`,
    click.visitorHash, click.kind, click.projectId, click.host, click.path, at,
    at - 3_000_000, click.visitorHash, click.kind, click.projectId);
  }

  async recentVisits(windowMs: number, limit: number) {
    const rows = await this.query<{ id: number; country: string | null; path: string; created_at: number }>(
      "SELECT id,country,path,created_at FROM visitor_events WHERE created_at > ? ORDER BY created_at DESC,id DESC LIMIT ?",
      nowMicros() - windowMs * 1000, limit);
    return rows.map(row => ({ id: row.id, country: row.country, path: row.path, createdAt: isoMicros(row.created_at) }));
  }

  async traffic(days: number) {
    const since = nowMicros() - days * 86_400_000_000;
    const results = await this.database.batch([
      this.database.prepare(`SELECT country,count(*) AS views,count(DISTINCT visitor_hash) AS visitors
        FROM visitor_events WHERE created_at > ? GROUP BY country`).bind(since),
      this.database.prepare(`SELECT count(*) AS visitors,count(*) FILTER (WHERE days > 1) AS "returning" FROM (
        SELECT count(DISTINCT date(created_at / 1000000,'unixepoch')) AS days FROM visitor_events
        WHERE created_at > ? AND visitor_hash IS NOT NULL GROUP BY visitor_hash)`).bind(since),
    ]);
    return {
      countries: results[0].results as { country: string | null; views: number; visitors: number }[],
      totals: results[1].results[0] as { visitors: number; returning: number },
    };
  }

  async sources(days: number, internal: string, direct: string) {
    const [{ since }] = await this.query<{ since: number | null }>(
      "SELECT min(created_at) AS since FROM visitor_events WHERE referrer_host IN (?,?)", internal, direct);
    if (since === null) return { since: null, rows: [] };
    const rows = await this.query<{ ref: string | null; referrer_host: string | null; visitors: number }>(
      `SELECT ref,referrer_host,count(DISTINCT visitor_hash)+count(*) FILTER (WHERE visitor_hash IS NULL) AS visitors
      FROM visitor_events WHERE created_at > ? AND created_at >= ? AND referrer_host IS NOT NULL
      AND referrer_host <> ? GROUP BY ref,referrer_host`, nowMicros() - days * 86_400_000_000, since, internal);
    return { since, rows };
  }

  async clickCounts(days: number) {
    const since = nowMicros() - days * 86_400_000_000;
    const queries = [
      "SELECT count(*) AS clicks,count(DISTINCT visitor_hash) AS clickers FROM link_clicks WHERE created_at > ?",
      "SELECT kind,count(*) AS clicks,count(DISTINCT visitor_hash) AS clickers FROM link_clicks WHERE created_at > ? GROUP BY kind",
      `SELECT project_id AS projectId,count(*) FILTER (WHERE opened) AS opened,
        count(*) FILTER (WHERE opened AND followed) AS followed FROM (
          SELECT project_id,visitor_hash,max(kind = 'project_open') AS opened,
          max(kind IN ('source','tweet','author')) AS followed FROM link_clicks
          WHERE created_at > ? AND project_id IS NOT NULL GROUP BY project_id,visitor_hash) GROUP BY project_id`,
      `SELECT host,count(DISTINCT visitor_hash) AS clickers FROM link_clicks WHERE created_at > ?
        AND host IS NOT NULL AND kind IN ('source','tweet','author') GROUP BY host`,
    ];
    const results = await this.database.batch(queries.map(query => this.database.prepare(query).bind(since)));
    return {
      total: results[0].results[0] as { clicks: number; clickers: number },
      kinds: results[1].results as { kind: string; clicks: number; clickers: number }[],
      projects: results[2].results as { projectId: string; opened: number; followed: number }[],
      hosts: results[3].results as { host: string; clickers: number }[],
    };
  }

  async adminByEmail(email: string) {
    const rows = await this.query<{ id: string; email: string }>(
      "SELECT CAST(id AS TEXT) AS id,email FROM admin_users WHERE email = ? AND access_enabled = 1", email.trim().toLowerCase());
    return rows[0] ? { ...rows[0], usingTempPassword: false } : null;
  }

  async inviteAdmin(email: string): Promise<boolean> {
    const result = await this.database.prepare(`INSERT INTO admin_users(email,password_hash,using_temp_password,created_at)
      VALUES (?,'',0,?) ON CONFLICT(email) DO NOTHING`).bind(email.trim().toLowerCase(), nowMicros()).run();
    return result.meta.changes > 0;
  }

  async revokeAdmin(email: string): Promise<boolean> {
    // Updating and session revocation are one transaction. Access JWTs also fail the next allowlist lookup.
    const results = await this.database.batch([
      this.database.prepare("UPDATE admin_users SET access_enabled = 0,credential_version = credential_version + 1 WHERE email = ?").bind(email.trim().toLowerCase()),
      this.database.prepare("DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM admin_users WHERE email = ?)").bind(email.trim().toLowerCase()),
    ]);
    return results[0].meta.changes > 0;
  }

  async visitorRecords(hash: string) {
    const results = await this.database.batch([
      this.database.prepare("SELECT count(*) AS views,min(created_at) AS first_seen,max(created_at) AS last_seen FROM visitor_events WHERE visitor_hash = ?").bind(hash),
      this.database.prepare("SELECT DISTINCT country FROM visitor_events WHERE visitor_hash = ? AND country IS NOT NULL ORDER BY country").bind(hash),
      this.database.prepare("SELECT count(*) AS clicks FROM link_clicks WHERE visitor_hash = ?").bind(hash),
    ]);
    const row = results[0].results[0] as { views: number; first_seen: number | null; last_seen: number | null };
    return { views: row.views, clicks: Number(results[2].results[0].clicks),
      firstSeen: row.first_seen === null ? null : isoMicros(row.first_seen),
      lastSeen: row.last_seen === null ? null : isoMicros(row.last_seen),
      countries: results[1].results.map(row => String(row.country)) };
  }

  async deleteVisitor(hash: string): Promise<number> {
    const results = await this.database.batch([
      this.database.prepare("DELETE FROM visitor_events WHERE visitor_hash = ?").bind(hash),
      this.database.prepare("DELETE FROM link_clicks WHERE visitor_hash = ?").bind(hash),
    ]);
    return results[0].meta.changes + results[1].meta.changes;
  }
}
