// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker, { createWorker } from "../../worker";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAccessIdentity } from "../accessIdentity";
import { D1Store } from "../d1Store";
import projects from "../../data/worker-projects.json";
import { hashVisitor } from "../visitorHash";

const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('ok')}}",
  compatibilityDate: "2026-10-07", d1Databases: { DB: "jev-http-test" } }));
const DB = await runtime.getD1Database("DB");
const env = { DB, APP_ENV: "production", WRITE_MODE: "normal", SUBMISSIONS_ENABLED: "false", VISITOR_HASH_SECRET: "functional-test-secret-with-32-characters",
  ASSETS: { async fetch() { return new Response("<!doctype html><title>Static page</title>", { headers: { "Content-Type": "text/html" } }); } } };
const headers = { "cf-connecting-ip": "192.0.2.10", "user-agent": "Mozilla/5.0", "sec-fetch-site": "same-origin" };
async function call(path: string, init: RequestInit = {}, overrides = {}) {
  const pending: Promise<unknown>[] = [];
  const response = await worker.fetch(new Request(`https://www.jevusecases.com${path}`, { ...init, headers: { ...headers, ...init.headers } }),
    { ...env, ...overrides }, { waitUntil(promise) { pending.push(promise); } });
  await Promise.all(pending);
  return response;
}
beforeAll(async () => {
  const statements = readFileSync("migrations/0001_initial.sql", "utf8").split(";").map(part => part.trim()).filter(Boolean);
  await DB.batch(statements.map(statement => DB.prepare(statement)));
});
beforeEach(async () => { await DB.batch([DB.prepare("DELETE FROM visitor_events"), DB.prepare("DELETE FROM link_clicks")]); });
afterAll(() => runtime.dispose());

test("a public navigation stores the stable hash and only the referring host", async () => {
  expect((await call("/?ref=launch", { headers: { referer: "https://example.com/private?token=secret" } })).status).toBe(200);
  expect((await DB.prepare("SELECT visitor_hash,ref,referrer_host,path FROM visitor_events").all()).results).toEqual([
    { visitor_hash: hashVisitor("192.0.2.10", env.VISITOR_HASH_SECRET), ref: "launch", referrer_host: "example.com", path: "/" },
  ]);
});
test.each([
  [{ headers: { "purpose": "prefetch" } }, {}],
  [{ headers: { "user-agent": "Googlebot" } }, {}],
  [{ headers: { "cookie": "CF_Authorization=opaque" } }, {}],
  [{ headers: { "cookie": "jevusecases_session=opaque" } }, {}],
  [{}, { APP_ENV: "preview" }],
  [{}, { WRITE_MODE: "maintenance" }],
  [{ method: "HEAD" }, {}],
])("excluded public requests leave analytics empty (%j)", async (init, overrides) => {
  await call("/", init, overrides);
  expect((await DB.prepare("SELECT count(*) AS count FROM visitor_events").all()).results).toEqual([{ count: 0 }]);
});
test("click HTTP boundary validates input and derives destination from catalogue", async () => {
  const project = projects.find(project => project.github)!;
  const init = { method: "POST", body: JSON.stringify({ kind: "source", project: project.id }), headers: { referer: "https://www.jevusecases.com/" } };
  expect((await call("/api/link-click", init)).status).toBe(204);
  expect((await call("/api/link-click", init)).status).toBe(204);
  expect((await DB.prepare("SELECT kind,project_id,host,path FROM link_clicks").all()).results).toEqual([
    { kind: "source", project_id: project.id, host: "github.com", path: "/" },
  ]);
  expect((await call("/api/link-click", { method: "POST", body: JSON.stringify({ kind: "source", project: project.id, host: "evil.example" }) })).status).toBe(400);
  expect((await call("/api/link-click", { method: "POST", body: "x".repeat(513) })).status).toBe(413);
});
test.each(["/admin", "/admin.html", "/admin/traffic", "/api/admin"])("missing or forged identity cannot retrieve %s", async path => {
  const response = await call(path, { headers: { "cf-access-jwt-assertion": "forged", "cf-access-authenticated-user-email": "owner@example.com" } });
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: "unauthorized" });
});
test("maintenance disables click and submission writes", async () => {
  expect((await call("/api/link-click", { method: "POST", body: JSON.stringify({ kind: "footer_repo" }) }, { WRITE_MODE: "maintenance" })).status).toBe(503);
  expect((await call("/api/submit", { method: "POST", body: "{}" })).status).toBe(503);
  expect((await DB.prepare("SELECT count(*) AS count FROM link_clicks").all()).results).toEqual([{ count: 0 }]);
});
test("canonical redirect preserves the path and query", async () => {
  const response = await worker.fetch(new Request("https://jevusecases.com/privacy?ref=launch"), env, { waitUntil() {} });
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("https://www.jevusecases.com/privacy?ref=launch");
});
test("a signed identity needs the D1 allowlist, and revocation immediately denies it", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "provider-key", alg: "RS256" }] });
  const app = createWorker((token, config) => verifyAccessIdentity(token, config, resolver));
  const config = { ...env, ACCESS_ISSUER: "https://fixture.cloudflareaccess.com", ACCESS_AUD: "fixture-app" };
  const token = await new SignJWT({ email: "owner@example.com" }).setProtectedHeader({ alg: "RS256", kid: "provider-key" })
    .setIssuer(config.ACCESS_ISSUER).setAudience(config.ACCESS_AUD).setSubject("owner").setIssuedAt().setExpirationTime("1h").sign(privateKey);
  const get = (path: string) => app.fetch(new Request(`https://www.jevusecases.com${path}`, { headers: { "cf-access-jwt-assertion": token } }), config, { waitUntil() {} });
  expect((await get("/api/admin")).status).toBe(401);
  const store = new D1Store(DB);
  await store.inviteAdmin("owner@example.com");
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) * 1000;
  const visit = { country: "GH", path: "/", visitorHash: "first", ref: null, referrerHost: "(direct)" };
  await store.recordVisit(visit, midnight - 4_000_000);
  await store.recordVisit(visit, midnight + 4_000_000);
  await store.recordVisit({ ...visit, country: "US", visitorHash: "second" }, midnight + 4_000_000);
  const response = await get("/api/admin");
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.admin.email).toBe("owner@example.com");
  expect(data.summary).toEqual({ visitors: 2, returning: 1, views: 3, rows: [{ kind: "other", views: 3, visitors: 2 }] });
  const login = await get("/admin/login");
  expect(login.status).toBe(302);
  expect(login.headers.get("location")).toBe("/admin");
  await store.revokeAdmin("owner@example.com");
  expect((await get("/api/admin")).status).toBe(401);
});
