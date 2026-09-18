import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSubmissionPr } from "../github";
import type { Project } from "../projects";
import type { SubmissionInput } from "../submission";

const entry: Project = {
  id: "jev-guard-ab12cd",
  project: "jev-guard",
  description: "Security classifier for coding-agent tool calls.",
  github: "https://github.com/leepokai/jev-guard",
  website: null,
  how_used_jev: null,
  source_tweet: null,
  author: null,
  date_found: "2026-09-18",
  is_build: true,
  category: "security / guardrails",
  replaces: null,
  cost_signal: null,
  benchmark: null,
  jaggedness_reports: [],
  security_status: null,
  recipe: null,
};

const submission: SubmissionInput = {
  name: "jev-guard",
  description: entry.description,
  category: entry.category as SubmissionInput["category"],
  sourceLink: entry.github!,
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return new Response(JSON.stringify(body), { status });
}

describe("createSubmissionPr", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("GITHUB_SUBMIT_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("fails without touching the network when no token is configured", async () => {
    vi.stubEnv("GITHUB_SUBMIT_TOKEN", "");

    const result = await createSubmissionPr(entry, submission);

    expect(result).toEqual({ success: false, reason: "missing_token" });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("creates a branch, updates the data file, and opens a PR on the happy path", async () => {
    const existingContent = Buffer.from(JSON.stringify([{ id: "existing" }], null, 2)).toString("base64");

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/submission/jev-guard-ab12cd" }))
      .mockResolvedValueOnce(jsonResponse({ content: existingContent, sha: "file-sha" }))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: "new-file-sha" } }))
      .mockResolvedValueOnce(jsonResponse({ html_url: "https://github.com/theSekyi/jevusecases/pull/42" }));

    const result = await createSubmissionPr(entry, submission);

    expect(result).toEqual({ success: true, prUrl: "https://github.com/theSekyi/jevusecases/pull/42" });
    const [refCall, createRefCall, contentCall, updateCall, prCall] = vi.mocked(fetch).mock.calls;
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);

    expect(refCall[0]).toContain("/git/ref/heads/main");

    expect(createRefCall[1]?.method).toBe("POST");
    const createRefBody = JSON.parse(createRefCall[1]!.body as string);
    expect(createRefBody).toEqual({ ref: "refs/heads/submission/jev-guard-ab12cd", sha: "base-sha" });

    // Pinned to the exact commit the branch was created from, not to a second, independent read of main.
    expect(contentCall[0]).toContain("ref=base-sha");
    expect(contentCall[0]).not.toContain("ref=main");

    const updateBody = JSON.parse(updateCall[1]!.body as string);
    const updatedProjects = JSON.parse(Buffer.from(updateBody.content, "base64").toString("utf-8"));
    expect(updatedProjects).toEqual([{ id: "existing" }, entry]);
    expect(updateBody.sha).toBe("file-sha");
    expect(updateBody.branch).toBe("submission/jev-guard-ab12cd");

    const prRequestBody = JSON.parse(prCall[1]!.body as string);
    expect(prRequestBody.head).toBe("submission/jev-guard-ab12cd");
    expect(prRequestBody.base).toBe("main");
    expect(prRequestBody.body).toContain(submission.name);
    expect(prRequestBody.body).toContain(submission.sourceLink);
  });

  test("wraps a submitted x handle in backticks in the PR body, instead of a live @mention", async () => {
    const existingContent = Buffer.from(JSON.stringify([], null, 2)).toString("base64");
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ content: existingContent, sha: "file-sha" }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ html_url: "https://github.com/theSekyi/jevusecases/pull/1" }));

    await createSubmissionPr(entry, { ...submission, xHandle: "torvalds" });

    const [, , , , prCall] = vi.mocked(fetch).mock.calls;
    const prRequestBody = JSON.parse(prCall[1]!.body as string);
    expect(prRequestBody.body).toContain("`@torvalds`");
    expect(prRequestBody.body).not.toMatch(/[^`]@torvalds/);
  });

  test("stops and reports a reason when the base branch lookup fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, false, 404));

    const result = await createSubmissionPr(entry, submission);

    expect(result).toEqual({ success: false, reason: "base_ref_lookup_failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("stops and reports a reason when the data file isn't valid JSON", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ content: Buffer.from("not json").toString("base64"), sha: "file-sha" }),
      );

    const result = await createSubmissionPr(entry, submission);

    expect(result).toEqual({ success: false, reason: "data_file_unparseable" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("cleans up the just-created branch when the data file update fails", async () => {
    const existingContent = Buffer.from(JSON.stringify([], null, 2)).toString("base64");
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ content: existingContent, sha: "file-sha" }))
      .mockResolvedValueOnce(jsonResponse({}, false, 409))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await createSubmissionPr(entry, submission);

    expect(result).toEqual({ success: false, reason: "data_file_update_failed" });
    const cleanupCall = vi.mocked(fetch).mock.calls[4];
    expect(cleanupCall[0]).toContain("/git/refs/heads/submission/jev-guard-ab12cd");
    expect(cleanupCall[1]?.method).toBe("DELETE");
  });

  test("cleans up the branch when opening the PR fails, but still reports the PR failure", async () => {
    const existingContent = Buffer.from(JSON.stringify([], null, 2)).toString("base64");
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ content: existingContent, sha: "file-sha" }))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: "new-file-sha" } }))
      .mockResolvedValueOnce(jsonResponse({}, false, 422))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await createSubmissionPr(entry, submission);

    expect(result).toEqual({ success: false, reason: "pr_create_failed" });
    const cleanupCall = vi.mocked(fetch).mock.calls[5];
    expect(cleanupCall[1]?.method).toBe("DELETE");
  });
});
