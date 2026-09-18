import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

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
    expect(recordVisitorEvent).toHaveBeenCalledWith("US", "/submit");
  });

  test("a submitted path can't be anything other than the real request path — there is no client input here", async () => {
    const { proxy } = await import("../proxy");
    const request = new NextRequest("https://jevusecases.com/some/real/route", {
      headers: { "x-forwarded-for": "203.0.113.6" },
    });
    const { event, waited } = fakeEvent();

    proxy(request, event as never);
    await Promise.all(waited);

    expect(recordVisitorEvent).toHaveBeenCalledWith("US", "/some/real/route");
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

    expect(recordVisitorEvent).toHaveBeenCalledWith(null, "/");
  });

  test("collapses a rapid-fire duplicate from the same visitor into one recorded event", async () => {
    const { proxy } = await import("../proxy");
    const ip = "203.0.113.12";
    const makeRequest = () => new NextRequest("https://jevusecases.com/", { headers: { "x-forwarded-for": ip } });

    const first = fakeEvent();
    proxy(makeRequest(), first.event as never);
    await Promise.all(first.waited);

    const second = fakeEvent();
    proxy(makeRequest(), second.event as never);
    await Promise.all(second.waited);

    expect(recordVisitorEvent).toHaveBeenCalledTimes(1);
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
