import { D1Store, isoMicros } from "./lib/d1Store";
import type { DatabaseBinding } from "./lib/cloudflare";
import { accessConfiguration, verifyAccessIdentity } from "./lib/accessIdentity";
import { createRateLimiter, normalizeIp } from "./lib/rateLimit";
import { hashVisitor } from "./lib/visitorHash";
import { countryCodeToFlag, isValidCountryCode, LIVE_WINDOW_MS, VISIBLE_EVENT_COUNT, TRAFFIC_WINDOW_DAYS } from "./lib/visitorFormat";
import { DIRECT_SOURCE, INTERNAL_SOURCE, isAutomatedClient, visitSource } from "./lib/visitorRules";
import { summarizeCountries } from "./lib/trafficSummary";
import { summarizeSources } from "./lib/sourceSummary";
import { clickHost, summarizeLinkClicks } from "./lib/clickSummary";
import { isLinkKind, takesProject } from "./lib/linkKinds";
import { validateSubmission } from "./lib/submission";
import { buildSubmissionEntry } from "./lib/submissionEntry";
import { createSubmissionPr } from "./lib/github";
import projects from "./data/worker-projects.json";
import { SESSION_COOKIE } from "./lib/authConstants";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: DatabaseBinding;
  APP_ENV: string;
  WRITE_MODE: string;
  SUBMISSIONS_ENABLED: string;
  VISITOR_HASH_SECRET?: string;
  GITHUB_SUBMIT_TOKEN?: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUD?: string;
}
interface Context { waitUntil(promise: Promise<unknown>): void }
const byId = new Map(projects.map(project => [project.id, project]));
const visitLimit = createRateLimiter(60, 60_000);
const clickLimit = createRateLimiter(60, 60_000);
const feedLimit = createRateLimiter(30, 60_000);
const submitLimit = createRateLimiter(5, 3_600_000);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const ipOf = (request: Request) => normalizeIp(request.headers.get("cf-connecting-ip")?.trim() || "unknown");
const adminCookie = (request: Request) => (request.headers.get("cookie") || "").split(";").some(cookie => ["CF_Authorization", SESSION_COOKIE].includes(cookie.trim().split("=")[0]));

async function smallBody(request: Request, limit: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let bytes = 0, text = "";
  const decoder = new TextDecoder();
  for (;;) {
    const part = await reader.read();
    if (part.done) return text + decoder.decode();
    bytes += part.value.byteLength;
    if (bytes > limit) { await reader.cancel(); return null; }
    text += decoder.decode(part.value, { stream: true });
  }
}

function publicPath(path: string): boolean {
  if (["/", "/privacy", "/submit"].includes(path)) return true;
  return path.startsWith("/p/") && byId.has(path.slice(3));
}
function clickPath(request: Request): string | null {
  try {
    const ref = new URL(request.headers.get("referer") || "");
    return ref.host === new URL(request.url).host && publicPath(ref.pathname) ? ref.pathname : null;
  } catch { return null; }
}

export function createWorker(verifyIdentity: typeof verifyAccessIdentity = verifyAccessIdentity) {
return {
  async fetch(request: Request, env: Env, context: Context): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "jevusecases.com") {
      url.hostname = "www.jevusecases.com";
      return Response.redirect(url.href, 308);
    }
    const store = new D1Store(env.DB);
    try {
      if (/^\/(?:admin(?:[/.]|$)|api\/admin(?:[/.]|$))/.test(url.pathname)) {
        let email: string | null = null;
        try { email = await verifyIdentity(request.headers.get("cf-access-jwt-assertion") || "", accessConfiguration(env)); } catch { /* fail closed */ }
        const admin = email ? await store.adminByEmail(email) : null;
        if (!admin) return json({ error: "unauthorized" }, 401);
        if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405);
        if (url.pathname === "/admin/login") return new Response(null, { status: 302, headers: { Location: "/admin", "Cache-Control": "private, no-store" } });
        if (url.pathname === "/api/admin") {
          const [traffic, sources, clicks] = await Promise.all([
            store.traffic(TRAFFIC_WINDOW_DAYS), store.sources(TRAFFIC_WINDOW_DAYS, INTERNAL_SOURCE, DIRECT_SOURCE), store.clickCounts(TRAFFIC_WINDOW_DAYS),
          ]);
          return json({ admin, summary: { ...summarizeCountries(traffic.countries), ...traffic.totals },
            sources: sources.since === null ? { visitors: 0, rows: [], partialSince: null, collecting: true }
              : { ...summarizeSources(sources.rows.map(row => ({ ...row, referrerHost: row.referrer_host }))), collecting: false,
                partialSince: sources.since / 1000 > Date.now() - TRAFFIC_WINDOW_DAYS * 86_400_000 ? isoMicros(sources.since) : null },
            clicks: summarizeLinkClicks(clicks, id => byId.get(id)?.project ?? null) });
        }
        const asset = await env.ASSETS.fetch(request);
        const response = new Response(asset.body, asset);
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-Robots-Tag", "noindex, nofollow");
        return response;
      }
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/visitor-events" && request.method === "GET") {
          if (!feedLimit(ipOf(request))) return json({ events: [] }, 429);
          const events = await store.recentVisits(LIVE_WINDOW_MS, VISIBLE_EVENT_COUNT);
          return json({ events: events.map(event => ({ ...event, flag: countryCodeToFlag(event.country) })) });
        }
        if (url.pathname === "/api/link-click" && request.method === "POST") {
          const site = request.headers.get("sec-fetch-site");
          if (site && site !== "same-origin") return new Response(null, { status: 403 });
          const text = await smallBody(request, 512);
          if (text === null) return new Response(null, { status: 413 });
          let body;
          try { body = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["kind", "project"].includes(key))
            || !isLinkKind(body.kind) || (body.project !== undefined && (typeof body.project !== "string" || body.project.length > 200))) return new Response(null, { status: 400 });
          const project = body.project === undefined ? null : byId.get(body.project) ?? null;
          if (takesProject(body.kind) ? !project : body.project !== undefined) return new Response(null, { status: 400 });
          if (env.WRITE_MODE === "maintenance") return new Response(null, { status: 503 });
          if (env.APP_ENV === "preview" || isAutomatedClient(request.headers.get("user-agent")) || adminCookie(request)) return new Response(null, { status: 204 });
          const ip = ipOf(request);
          if (!clickLimit(ip)) return new Response(null, { status: 429 });
          const visitorHash = hashVisitor(ip, env.VISITOR_HASH_SECRET ?? null);
          if (visitorHash) await store.recordClick({ kind: body.kind, projectId: project?.id ?? null, host: clickHost(body.kind, project), path: clickPath(request), visitorHash });
          return new Response(null, { status: 204 });
        }
        if (url.pathname === "/api/submit" && request.method === "POST") {
          if (env.WRITE_MODE === "maintenance" || env.SUBMISSIONS_ENABLED !== "true") return json({ error: "maintenance" }, 503);
          if (!submitLimit(ipOf(request))) return json({ error: "rate_limited" }, 429);
          const text = await smallBody(request, 32_768);
          if (text === null) return json({ error: "too_large" }, 413);
          let body;
          try { body = JSON.parse(text); } catch { return json({ error: "invalid_json" }, 400); }
          const result = validateSubmission(body);
          if (!result.success) return json({ error: "validation_failed", fieldErrors: result.errors }, 400);
          const pr = await createSubmissionPr(buildSubmissionEntry(result.data), result.data, env.GITHUB_SUBMIT_TOKEN);
          return pr.success ? json({ success: true, prUrl: pr.prUrl }, 201) : json({ error: "github_error" }, 502);
        }
        return json({ error: "not_found" }, 404);
      }
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      if (response.ok && (/\/(?:icon|apple-icon|opengraph-image)$/.test(url.pathname))) response.headers.set("Content-Type", "image/png");
      if (response.status === 404 && !response.headers.has("Content-Type")) response.headers.set("Content-Type", "text/html; charset=utf-8");
      if (response.ok && request.method === "GET" && publicPath(url.pathname) && env.APP_ENV === "production" && env.WRITE_MODE !== "maintenance"
        && !request.headers.has("next-router-prefetch") && request.headers.get("purpose") !== "prefetch"
        && !request.headers.get("sec-purpose")?.includes("prefetch") && !isAutomatedClient(request.headers.get("user-agent")) && !adminCookie(request)) {
        const ip = ipOf(request);
        if (visitLimit(ip)) {
          const country = (request as Request & { cf?: { country?: string } }).cf?.country;
          context.waitUntil(store.recordVisit({ country: isValidCountryCode(country) ? country : null, path: url.pathname,
            visitorHash: hashVisitor(ip, env.VISITOR_HASH_SECRET ?? null), ...visitSource(url, request.headers.get("referer")) })
            .catch(() => console.error("Visitor recording failed")));
        }
      }
      return response;
    } catch {
      console.error("Worker operation failed");
      return json({ error: "service_unavailable" }, 502);
    }
  },
};
}
const worker = createWorker();
export default worker;
