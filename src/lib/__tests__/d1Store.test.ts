// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { D1Store } from "../d1Store";

const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('ok')}}",
  compatibilityDate: "2026-10-07", d1Databases: { DB: "jev-test" } }));
const database = await runtime.getD1Database("DB");
const store = new D1Store(database);

beforeAll(async () => {
  const schema = readFileSync("migrations/0001_initial.sql", "utf8").split(";").map(part => part.trim()).filter(Boolean);
  await database.batch(schema.map(statement => database.prepare(statement)));
});
beforeEach(async () => {
  await database.batch([database.prepare("DELETE FROM admin_sessions"), database.prepare("DELETE FROM admin_users"),
    database.prepare("DELETE FROM visitor_events"), database.prepare("DELETE FROM link_clicks")]);
});
afterAll(() => runtime.dispose());

test("concurrent clicks deduplicate across a rolling boundary, and allow a click at exactly three seconds", async () => {
  const click = { visitorHash: "fixture", kind: "source", projectId: "fixture-project", path: "/", host: "example.com" };
  await Promise.all([store.recordClick(click, 1_999_000), store.recordClick(click, 1_999_000)]);
  await store.recordClick(click, 3_001_000);
  expect((await database.prepare("SELECT count(*) AS count FROM link_clicks").all()).results).toEqual([{ count: 1 }]);
  await store.recordClick(click, 4_999_000);
  expect((await database.prepare("SELECT count(*) AS count FROM link_clicks").all()).results).toEqual([{ count: 2 }]);
});

test("anonymous visits deduplicate by nullable country regardless of path", async () => {
  await Promise.all([
    store.recordVisit({ country: null, path: "/", visitorHash: null, ref: null, referrerHost: "direct" }, 10_000_000),
    store.recordVisit({ country: null, path: "/privacy", visitorHash: null, ref: null, referrerHost: "direct" }, 10_000_000),
  ]);
  await store.recordVisit({ country: "GH", path: "/", visitorHash: null, ref: null, referrerHost: "direct" }, 10_000_000);
  expect((await database.prepare("SELECT count(*) AS count FROM visitor_events").all()).results).toEqual([{ count: 2 }]);
});

test("visitor deletion removes both tables and returns the saved record count", async () => {
  await store.recordVisit({ country: "GH", path: "/", visitorHash: "fixture", ref: null, referrerHost: "direct" });
  await store.recordClick({ visitorHash: "fixture", kind: "source", projectId: null, path: "/", host: null });
  expect(await store.deleteVisitor("fixture")).toBe(2);
  expect(await store.visitorRecords("fixture")).toEqual({ views: 0, clicks: 0, countries: [], firstSeen: null, lastSeen: null });
});

test("a failed visitor deletion rolls back both tables", async () => {
  await store.recordVisit({ country: "GH", path: "/", visitorHash: "fixture", ref: null, referrerHost: "direct" });
  await store.recordClick({ visitorHash: "fixture", kind: "source", projectId: null, path: "/", host: null });
  await database.prepare("CREATE TRIGGER refuse_click_delete BEFORE DELETE ON link_clicks BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
  try {
    await expect(store.deleteVisitor("fixture")).rejects.toThrow("fixture failure");
    expect((await database.prepare("SELECT count(*) AS count FROM visitor_events").all()).results).toEqual([{ count: 1 }]);
    expect((await database.prepare("SELECT count(*) AS count FROM link_clicks").all()).results).toEqual([{ count: 1 }]);
  } finally { await database.prepare("DROP TRIGGER refuse_click_delete").run(); }
});

test("revoked admins lose access immediately and their legacy sessions are removed", async () => {
  expect(await store.inviteAdmin("fixture@example.com")).toBe(true);
  const admin = await store.adminByEmail("fixture@example.com");
  await database.prepare("INSERT INTO admin_sessions(token_hash,user_id,created_at,expires_at) VALUES ('fixture',?,1,2)").bind(admin!.id).run();
  expect(await store.revokeAdmin("fixture@example.com")).toBe(true);
  expect(await store.adminByEmail("fixture@example.com")).toBeNull();
  expect((await database.prepare("SELECT count(*) AS count FROM admin_sessions").all()).results).toEqual([{ count: 0 }]);
});
