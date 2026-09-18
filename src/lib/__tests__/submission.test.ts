import { describe, expect, test } from "vitest";
import { validateSubmission } from "../submission";

const validInput = {
  name: "Jev Trader",
  description: "Decides buy/sell on a live price feed.",
  category: "trading / on-chain agents",
  sourceLink: "https://github.com/jarrodwatts/jev-trader",
  xHandle: "@jarrodwatts",
};

describe("validateSubmission", () => {
  test("accepts a fully valid submission", () => {
    const result = validateSubmission(validInput);
    expect(result.success).toBe(true);
  });

  test("accepts a missing optional xHandle", () => {
    const result = validateSubmission({ ...validInput, xHandle: "" });
    expect(result.success).toBe(true);
  });

  test.each(["name", "description", "sourceLink"] as const)(
    "rejects an empty required field: %s",
    (field) => {
      const result = validateSubmission({ ...validInput, [field]: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[field]).toBeDefined();
      }
    },
  );

  test("rejects an invalid category", () => {
    const result = validateSubmission({ ...validInput, category: "not a real category" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.category).toBeDefined();
    }
  });

  test("rejects a source link that isn't a URL", () => {
    const result = validateSubmission({ ...validInput, sourceLink: "not a url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.sourceLink).toMatch(/valid URL/i);
    }
  });

  test("rejects a source link outside the host allowlist", () => {
    const result = validateSubmission({ ...validInput, sourceLink: "https://evil.example.com/malware" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.sourceLink).toMatch(/github\.com and npmjs\.com/i);
    }
  });

  test.each([
    "https://github.com/vercel/next.js",
    "https://www.npmjs.com/package/vitest",
    "https://gist.github.com/octocat/1",
  ])("accepts an allowlisted source link: %s", (sourceLink) => {
    const result = validateSubmission({ ...validInput, sourceLink });
    expect(result.success).toBe(true);
  });
});
