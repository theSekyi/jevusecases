import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConstants";
import { guard, makeProject } from "@/lib/__tests__/fixtures";

const recordLinkClick = vi.fn();
vi.mock("@/lib/linkClicks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/linkClicks")>("@/lib/linkClicks");
  return { ...actual, recordLinkClick: (...args: unknown[]) => recordLinkClick(...args) };
});
vi.mock("@/lib/projects", async () => {
  const actual = await vi.importActual<typeof import("@/lib/projects")>("@/lib/projects");
  return { ...actual, getProjects: () => [guard, makeProject({ id: "plain", project: "Plain" })] };
});

const SECRET = "s".repeat(40);

function post(body: unknown, headers: Record<string, string> = {}, ip = "203.0.113.1") {
  return new NextRequest("https://www.jevusecases.com/api/link-click", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "sec-fetch-site": "same-origin",
      referer: "https://www.jevusecases.com/",
      ...headers,
    },
  });
}

describe("POST /api/link-click", () => {
  beforeEach(() => {
    vi.resetModules();
    recordLinkClick.mockReset();
    recordLinkClick.mockResolvedValue(undefined);
    vi.stubEnv("VISITOR_HASH_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("records a click on a project's link, with the host worked out from the project and the page it came from", async () => {
    const { POST } = await import("../route");

    const response = await POST(post({ kind: "source", project: "guard" }, { referer: "https://www.jevusecases.com/p/guard?ref=x" }));

    expect(response.status).toBe(204);
    expect(recordLinkClick).toHaveBeenCalledTimes(1);
    const click = recordLinkClick.mock.calls[0][0];
    expect(click).toMatchObject({ kind: "source", projectId: "guard", host: "github.com", path: "/p/guard" });
    expect(click.visitorHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(click)).not.toContain("203.0.113.1");
  });

  test("records a site-wide click with no project", async () => {
    const { POST } = await import("../route");

    expect((await POST(post({ kind: "submit" }))).status).toBe(204);
    expect(recordLinkClick.mock.calls[0][0]).toMatchObject({ kind: "submit", projectId: null, host: null, path: "/" });
  });

  test("records without an identity when there is no hash secret", async () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "");
    const { POST } = await import("../route");

    await POST(post({ kind: "submit" }));

    expect(recordLinkClick.mock.calls[0][0].visitorHash).toBeNull();
  });

  test("keeps a referer from another site out of the stored path", async () => {
    const { POST } = await import("../route");

    await POST(post({ kind: "submit" }, { referer: "https://evil.example/page" }));
    await POST(post({ kind: "submit" }, { referer: "not a url" }));
    await POST(post({ kind: "submit" }, { referer: `https://www.jevusecases.com/${"a".repeat(300)}` }));
    const noReferer = { "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.9" };
    await POST(new NextRequest("https://www.jevusecases.com/api/link-click", { method: "POST", body: '{"kind":"submit"}', headers: noReferer }));

    expect(recordLinkClick.mock.calls.map((call) => call[0].path)).toEqual([null, null, null, null]);
  });

  test.each([
    ["an unknown kind", { kind: "made_up" }],
    ["a kind in the wrong case", { kind: "SOURCE", project: "guard" }],
    ["an unknown project", { kind: "source", project: "no-such-project" }],
    ["a project kind with no project", { kind: "source" }],
    ["a site-wide kind that names a project", { kind: "submit", project: "guard" }],
    ["a project id that is not a string", { kind: "source", project: 7 }],
    ["an empty project id", { kind: "source", project: "" }],
    ["a prototype key as a project id", { kind: "source", project: "__proto__" }],
    ["an extra field, such as a url to store", { kind: "source", project: "guard", url: "https://evil.example" }],
    ["a host supplied by the client", { kind: "submit", host: "evil.example" }],
    ["a body with no kind", {}],
    ["a body that is not an object", ["source"]],
    ["null", null],
  ])("rejects %s and stores nothing", async (_name, body) => {
    const { POST } = await import("../route");

    expect((await POST(post(body as never))).status).toBe(400);
    expect(recordLinkClick).not.toHaveBeenCalled();
  });

  test("rejects a body that is not JSON, or is too large, and stores nothing", async () => {
    const { POST } = await import("../route");

    expect((await POST(post("kind=submit"))).status).toBe(400);
    expect((await POST(post(""))).status).toBe(400);
    expect((await POST(post(JSON.stringify({ kind: "submit", project: "x".repeat(2000) })))).status).toBe(413);
    expect(recordLinkClick).not.toHaveBeenCalled();
  });

  test("refuses a request that a browser says came from another site", async () => {
    const { POST } = await import("../route");

    expect((await POST(post({ kind: "submit" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(post({ kind: "submit" }, { "sec-fetch-site": "same-site" }))).status).toBe(403);
    expect(recordLinkClick).not.toHaveBeenCalled();
  });

  test("answers a crawler, the admin and a preview exactly as it answers a person, and stores nothing", async () => {
    const { POST } = await import("../route");

    const crawler = await POST(post({ kind: "submit" }, { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }));
    const admin = await POST(post({ kind: "submit" }, { cookie: `${SESSION_COOKIE}=abc` }));
    vi.stubEnv("VERCEL_ENV", "preview");
    const preview = await POST(post({ kind: "submit" }));

    expect([crawler.status, admin.status, preview.status]).toEqual([204, 204, 204]);
    expect(recordLinkClick).not.toHaveBeenCalled();
  });

  test("still records on production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { POST } = await import("../route");

    await POST(post({ kind: "submit" }));

    expect(recordLinkClick).toHaveBeenCalledTimes(1);
  });

  test("a preview or crawler is told the same as a person even for a bad request, so bad input is checked first", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { POST } = await import("../route");

    expect((await POST(post({ kind: "made_up" }))).status).toBe(400);
  });

  test("rate-limits one address, and only that address", async () => {
    const { POST } = await import("../route");

    for (let i = 0; i < 60; i++) expect((await POST(post({ kind: "submit" }, {}, "198.51.100.7"))).status).toBe(204);
    expect((await POST(post({ kind: "submit" }, {}, "198.51.100.7"))).status).toBe(429);
    expect((await POST(post({ kind: "submit" }, {}, "198.51.100.8"))).status).toBe(204);
  });

  test("bad requests and bots do not use up the rate limit", async () => {
    const { POST } = await import("../route");

    for (let i = 0; i < 80; i++) await POST(post({ kind: "made_up" }, {}, "198.51.100.20"));
    for (let i = 0; i < 80; i++) await POST(post({ kind: "submit" }, { "user-agent": "curl/8.0" }, "198.51.100.20"));

    expect((await POST(post({ kind: "submit" }, {}, "198.51.100.20"))).status).toBe(204);
  });

  test("answers 502 when the database fails, instead of throwing", async () => {
    recordLinkClick.mockRejectedValueOnce(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("../route");

    expect((await POST(post({ kind: "submit" }))).status).toBe(502);
  });

  test("has no way to redirect: it only ever answers with an empty body", async () => {
    const { POST } = await import("../route");

    const response = await POST(post({ kind: "source", project: "guard" }));

    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
  });
});
