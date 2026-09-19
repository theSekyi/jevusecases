import { describe, expect, test } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../proxy";

function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: `https://jevusecases.com${url}` });
}

describe("proxy matcher", () => {
  test("matches real pages", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/submit")).toBe(true);
    expect(matches("/p/jev-guard")).toBe(true);
  });

  test("excludes API routes, including the strip's own polling endpoint — no self-recording loop", () => {
    expect(matches("/api/submit")).toBe(false);
    expect(matches("/api/visitor-events")).toBe(false);
  });

  test("excludes admin routes ahead of them existing", () => {
    expect(matches("/admin")).toBe(false);
    expect(matches("/admin/traffic")).toBe(false);
  });

  test("excludes static/metadata routes", () => {
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/apple-icon")).toBe(false);
    expect(matches("/icon")).toBe(false);
    expect(matches("/opengraph-image")).toBe(false);
    expect(matches("/p/jev-guard/opengraph-image")).toBe(false);
    expect(matches("/sitemap.xml")).toBe(false);
    expect(matches("/robots.txt")).toBe(false);
  });

  test("excludes anything that isn't a page: files with an extension and well-known paths", () => {
    expect(matches("/apple-touch-icon.png")).toBe(false);
    expect(matches("/apple-touch-icon-precomposed.png")).toBe(false);
    expect(matches("/manifest.webmanifest")).toBe(false);
    expect(matches("/images/logo.svg")).toBe(false);
    expect(matches("/.well-known/security.txt")).toBe(false);
    expect(matches("/.well-known")).toBe(false);
  });

  test("doesn't over-exclude a real route that merely starts with an excluded word", () => {
    expect(matches("/administration-guide")).toBe(true);
    expect(matches("/apiary")).toBe(true);
    expect(matches("/icons-explainer")).toBe(true);
    expect(matches("/well-known-projects")).toBe(true);
    expect(matches("/projects/v1.2/overview")).toBe(true);
  });
});
