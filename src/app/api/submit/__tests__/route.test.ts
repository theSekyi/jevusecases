import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const createSubmissionPr = vi.fn();
vi.mock("@/lib/github", () => ({ createSubmissionPr: (...args: unknown[]) => createSubmissionPr(...args) }));

const validBody = {
  name: "jev-guard",
  description: "Security classifier for coding-agent tool calls.",
  category: "security / guardrails",
  sourceLink: "https://github.com/leepokai/jev-guard",
};

function postRequest(body: unknown, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/submit", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/submit", () => {
  beforeEach(() => {
    vi.resetModules();
    createSubmissionPr.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("rejects a submission that fails schema validation without calling GitHub", async () => {
    const { POST } = await import("../route");

    const response = await POST(postRequest({ ...validBody, name: "" }, "10.0.0.1"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("validation_failed");
    expect(createSubmissionPr).not.toHaveBeenCalled();
  });

  test("rejects a source link outside the host allowlist even though the client already checked it", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      postRequest({ ...validBody, sourceLink: "https://evil.example.com/malware" }, "10.0.0.2"),
    );

    expect(response.status).toBe(400);
    expect(createSubmissionPr).not.toHaveBeenCalled();
  });

  test("returns 201 with the PR url on success", async () => {
    createSubmissionPr.mockResolvedValueOnce({
      success: true,
      prUrl: "https://github.com/theSekyi/jevusecases/pull/42",
    });
    const { POST } = await import("../route");

    const response = await POST(postRequest(validBody, "10.0.0.3"));

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({ success: true, prUrl: "https://github.com/theSekyi/jevusecases/pull/42" });
  });

  test("returns 502 when GitHub PR creation fails", async () => {
    createSubmissionPr.mockResolvedValueOnce({ success: false, reason: "pr_create_failed" });
    const { POST } = await import("../route");

    const response = await POST(postRequest(validBody, "10.0.0.4"));

    expect(response.status).toBe(502);
  });

  test("rate-limits repeated requests from the same IP independently of the client's own limit", async () => {
    createSubmissionPr.mockResolvedValue({ success: true, prUrl: "https://example.com/pr/1" });
    const { POST } = await import("../route");
    const ip = "10.0.0.5";

    for (let i = 0; i < 5; i++) {
      const response = await POST(postRequest(validBody, ip));
      expect(response.status).toBe(201);
    }

    const sixth = await POST(postRequest(validBody, ip));
    expect(sixth.status).toBe(429);
    expect(createSubmissionPr).toHaveBeenCalledTimes(5);
  });

  test("tracks rate limits per IP, not globally", async () => {
    createSubmissionPr.mockResolvedValue({ success: true, prUrl: "https://example.com/pr/1" });
    const { POST } = await import("../route");

    for (let i = 0; i < 5; i++) {
      await POST(postRequest(validBody, "10.0.0.6"));
    }
    const otherIp = await POST(postRequest(validBody, "10.0.0.7"));

    expect(otherIp.status).toBe(201);
  });

  test("rejects a body that isn't valid JSON", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/submit", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.8", "content-type": "application/json" },
      body: "not json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("invalid_json");
  });
});
