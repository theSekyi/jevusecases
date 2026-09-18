import { describe, expect, test } from "vitest";
import { buildSubmissionEntry } from "../submissionEntry";
import type { SubmissionInput } from "../submission";

const baseSubmission: SubmissionInput = {
  name: "jev-guard",
  description: "Security classifier for coding-agent tool calls.",
  category: "security / guardrails",
  sourceLink: "https://github.com/leepokai/jev-guard",
};

describe("buildSubmissionEntry", () => {
  test("fills in only the fields the submitter provided, leaving the rest null", () => {
    const entry = buildSubmissionEntry(baseSubmission);

    expect(entry.project).toBe("jev-guard");
    expect(entry.description).toBe(baseSubmission.description);
    expect(entry.category).toBe("security / guardrails");
    expect(entry.github).toBe("https://github.com/leepokai/jev-guard");
    expect(entry.website).toBeNull();
    expect(entry.how_used_jev).toBeNull();
    expect(entry.source_tweet).toBeNull();
    expect(entry.replaces).toBeNull();
    expect(entry.cost_signal).toBeNull();
    expect(entry.benchmark).toBeNull();
    expect(entry.jaggedness_reports).toEqual([]);
    expect(entry.security_status).toBeNull();
    expect(entry.recipe).toBeNull();
    expect(entry.is_build).toBe(true);
  });

  test("puts a non-github source link in website instead of github", () => {
    const entry = buildSubmissionEntry({
      ...baseSubmission,
      sourceLink: "https://npmjs.com/package/jev-guard",
    });

    expect(entry.github).toBeNull();
    expect(entry.website).toBe("https://npmjs.com/package/jev-guard");
  });

  test("normalizes an x handle into the author field, with a leading @", () => {
    const withAt = buildSubmissionEntry({ ...baseSubmission, xHandle: "@lbki34064963" });
    const withoutAt = buildSubmissionEntry({ ...baseSubmission, xHandle: "lbki34064963" });

    expect(withAt.author).toBe("@lbki34064963");
    expect(withoutAt.author).toBe("@lbki34064963");
  });

  test("leaves author null when no x handle was given", () => {
    const entry = buildSubmissionEntry(baseSubmission);
    expect(entry.author).toBeNull();
  });

  test("generates a unique, url-safe id even for a name with odd characters", () => {
    const entry = buildSubmissionEntry({ ...baseSubmission, name: "Jev/Guard!! 2.0" });
    expect(entry.id).toMatch(/^[a-z0-9-]+$/);

    const other = buildSubmissionEntry({ ...baseSubmission, name: "Jev/Guard!! 2.0" });
    expect(entry.id).not.toBe(other.id);
  });
});
