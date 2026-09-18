import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConstants";

const recordVisitorEvent = vi.fn();
vi.mock("@/lib/visitorEvents", async () => {
  const actual = await vi.importActual<typeof import("@/lib/visitorEvents")>("@/lib/visitorEvents");
  return { ...actual, recordVisitorEvent: (...args: unknown[]) => recordVisitorEvent(...args) };
});

const geolocation = vi.fn();
vi.mock("@vercel/functions", () => ({ geolocation: (...args: unknown[]) => geolocation(...args) }));

function fakeEvent() {
  const waited: Promise<unknown>[] = [];
  return { event: { waitUntil: (p: Promise<unknown>) => waited.push(p) }, waited };
}

describe("proxy", () => {
  beforeEach(() => {
    recordVisitorEvent.mockReset();
    geolocation.mockReset();
    geolocation.mockReturnValue({ country: "US" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("records the real request path and geolocated country, and doesn't block the response", async () => {
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/submit", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    const { event, waited } = fakeEvent();

    const response = proxy(request, event as never);
    await Promise.all(waited);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(recordVisitorEvent).toHaveBeenCalledWith("US", "/submit", null);
  });

  test("a submitted path can't be anything other than the real request path — there is no client input here", async () => {
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/some/real/route", {
      headers: { "x-forwarded-for": "203.0.113.6" },
    });
    const { event, waited } = fakeEvent();

    proxy(request, event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).toHaveBeenCalledWith("US", "/some/real/route", null);
  });

  test("rate-limits repeated requests from the same IP", async () => {
    vi.resetModules();
    const { proxy } = await import("../proxy");
    const ip = "203.0.113.7";

    for (let i = 0; i < 60; i++) {
      const { event, waited } = fakeEvent();
      proxy(new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": ip } }), event as never);
      await Promise.all(waited);
    }
    recordVisitorEvent.mockClear();

    const { event, waited } = fakeEvent();
    proxy(new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": ip } }), event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).not.toHaveBeenCalled();
  });

  test("a database failure is caught, not thrown, so the response still goes through", async () => {
    recordVisitorEvent.mockRejectedValueOnce(new Error("connection reset"));
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });
    const { event, waited } = fakeEvent();

    const response = proxy(request, event as never);
    await expect(Promise.all(waited)).resolves.toBeDefined();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("skips a prefetch request instead of recording a page nobody actually opened", async () => {
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/submit", {
      headers: { "x-forwarded-for": "203.0.113.9", "next-router-prefetch": "1" },
    });
    const { event, waited } = fakeEvent();

    proxy(request, event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).not.toHaveBeenCalled();
  });

  test("stores null instead of a malformed/spoofed geolocation value", async () => {
    geolocation.mockReturnValue({ country: "<script>alert(1)</script>" });
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const { event, waited } = fakeEvent();

    proxy(request, event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).toHaveBeenCalledWith(null, "/", null);
  });

  test("hands every request to the recorder; dropping repeats is its job, not the proxy's", async () => {
    const { proxy } = await import("../proxy");
    const ip = "203.0.113.12";

    for (let i = 0; i < 2; i++) {
      const { event, waited } = fakeEvent();
      proxy(new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": ip } }), event as never);
      await Promise.all(waited);
    }

    expect(recordVisitorEvent).toHaveBeenCalledTimes(2);
  });

  test("passes a stable hash of the client IP, not the IP", async () => {
    vi.stubEnv("VISITOR_HASH_SECRET", "test-secret");
    const { proxy } = await import("../proxy");
    const visit = async (ip: string) => {
      const { event, waited } = fakeEvent();
      proxy(new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": ip } }), event as never);
      await Promise.all(waited);
    };

    await visit("198.51.100.20");
    await visit("198.51.100.20");
    await visit("198.51.100.21");

    const hashes = recordVisitorEvent.mock.calls.map((call) => call[2]);
    expect(hashes[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[0]).not.toBe(hashes[2]);
    expect(JSON.stringify(recordVisitorEvent.mock.calls)).not.toContain("198.51.100");
    vi.unstubAllEnvs();
  });

  test("records nothing while the admin session cookie is present", async () => {
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/", {
      headers: { "x-forwarded-for": "203.0.113.13", cookie: `${SESSION_COOKIE}=anything` },
    });
    const { event, waited } = fakeEvent();

    proxy(request, event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).not.toHaveBeenCalled();
  });

  test("admin requests don't use up the visitor's rate-limit budget", async () => {
    vi.resetModules();
    const { proxy } = await import("../proxy");
    const ip = "203.0.113.15";

    for (let i = 0; i < 70; i++) {
      const { event, waited } = fakeEvent();
      const request = new NextRequest("https://jevusecases.com/", {
        headers: { "x-forwarded-for": ip, cookie: `${SESSION_COOKIE}=anything` },
      });
      proxy(request, event as never);
      await Promise.all(waited);
    }
    const { event, waited } = fakeEvent();
    proxy(new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": ip } }), event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).toHaveBeenCalledTimes(1);
  });

  test("other cookies don't stop a visit from being recorded", async () => {
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/", {
      headers: { "x-forwarded-for": "203.0.113.14", cookie: "theme=dark" },
    });
    const { event, waited } = fakeEvent();

    proxy(request, event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).toHaveBeenCalledWith("US", "/", null);
  });

  test("a throwing geolocation call is caught too, not just the database write", async () => {
    geolocation.mockImplementation(() => {
      throw new Error("unexpected header shape");
    });
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/", {
      headers: { "x-forwarded-for": "203.0.113.11" },
    });
    const { event, waited } = fakeEvent();

    const response = proxy(request, event as never);
    await expect(Promise.all(waited)).resolves.toBeDefined();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
