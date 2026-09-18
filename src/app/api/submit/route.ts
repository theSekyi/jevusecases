import { NextResponse, type NextRequest } from "next/server";
import { validateSubmission } from "@/lib/submission";
import { buildSubmissionEntry } from "@/lib/submissionEntry";
import { createSubmissionPr } from "@/lib/github";
import { createRateLimiter } from "@/lib/rateLimit";

const checkRateLimit = createRateLimiter(5, 60 * 60 * 1000);

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = validateSubmission(body);
  if (!result.success) {
    return NextResponse.json({ error: "validation_failed", fieldErrors: result.errors }, { status: 400 });
  }

  const entry = buildSubmissionEntry(result.data);
  const pr = await createSubmissionPr(entry, result.data);

  if (!pr.success) {
    console.error("Failed to create submission PR:", pr.reason);
    return NextResponse.json({ error: "github_error" }, { status: 502 });
  }

  return NextResponse.json({ success: true, prUrl: pr.prUrl }, { status: 201 });
}
