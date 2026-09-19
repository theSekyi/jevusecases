import { describe, expect, test } from "vitest";
import { countryCodeToFlag, countryName, formatShare, isValidCountryCode, relativeTime } from "../visitorFormat";

describe("isValidCountryCode", () => {
  test("accepts a plausible two-letter code, rejects everything else", () => {
    expect(isValidCountryCode("US")).toBe(true);
    expect(isValidCountryCode("gb")).toBe(true);
    expect(isValidCountryCode(null)).toBe(false);
    expect(isValidCountryCode(undefined)).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
    expect(isValidCountryCode("USA")).toBe(false);
    expect(isValidCountryCode("<script>alert(1)</script>")).toBe(false);
  });
});

describe("countryName", () => {
  test("resolves a real country code to its display name", () => {
    expect(countryName("US")).toBe("United States");
    expect(countryName("GB")).toBe("United Kingdom");
  });

  test("falls back to a generic label for missing/invalid input, e.g. local dev with no geolocation", () => {
    expect(countryName(null)).toBe("Somewhere");
    expect(countryName("not-a-code")).toBe("Somewhere");
  });
});

describe("relativeTime", () => {
  test("formats seconds and minutes", () => {
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(relativeTime("2026-01-01T00:00:00.000Z", base)).toBe("0s ago");
    expect(relativeTime("2026-01-01T00:00:00.000Z", base + 45_000)).toBe("45s ago");
    expect(relativeTime("2026-01-01T00:00:00.000Z", base + 90_000)).toBe("1m ago");
  });

  test("never goes negative for clock skew between client and server", () => {
    const base = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(relativeTime("2026-01-01T00:00:05.000Z", base)).toBe("0s ago");
  });
});

describe("countryCodeToFlag", () => {
  test("turns a country code into its flag emoji", () => {
    expect(countryCodeToFlag("US")).toBe("🇺🇸");
    expect(countryCodeToFlag("gb")).toBe("🇬🇧");
    expect(countryCodeToFlag("JP")).toBe("🇯🇵");
  });

  test("returns null for null, empty, or malformed input", () => {
    expect(countryCodeToFlag(null)).toBeNull();
    expect(countryCodeToFlag("")).toBeNull();
    expect(countryCodeToFlag("USA")).toBeNull();
    expect(countryCodeToFlag("1A")).toBeNull();
    expect(countryCodeToFlag("<script>")).toBeNull();
  });
});

describe("formatShare", () => {
  test("uses one decimal below 10% and whole numbers from there", () => {
    expect(formatShare(75, 100)).toBe("75%");
    expect(formatShare(93, 1000)).toBe("9.3%");
    expect(formatShare(1, 3)).toBe("33%");
  });

  test("never rounds up into an inconsistent '10.0%'", () => {
    expect(formatShare(996, 10000)).toBe("10%");
  });

  test("labels slivers instead of showing 0.0%", () => {
    expect(formatShare(1, 5000)).toBe("<0.1%");
  });

  test("an empty total is 0%, not a division by zero", () => {
    expect(formatShare(0, 0)).toBe("0%");
  });
});

describe("browser-safe modules", () => {
  test("keep the database out of their imports, so client components can use them", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["visitorFormat.ts", "sourceRules.ts"]) {
      const source = readFileSync(`src/lib/${file}`, "utf8");
      expect(source, file).not.toMatch(/from\s+["'](@\/lib\/db|\.\/db|\.\.\/db|@neondatabase)/);
    }
  });
});
