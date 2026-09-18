import type { Project } from "@/lib/projects";
import type { SubmissionInput } from "@/lib/submission";

const OWNER = "theSekyi";
const REPO = "jevusecases";
const BASE_BRANCH = "main";
const API_ROOT = "https://api.github.com";

export type CreateSubmissionPrFailureReason =
  | "missing_token"
  | "base_ref_lookup_failed"
  | "branch_create_failed"
  | "entry_file_create_failed"
  | "pr_create_failed";

export type CreateSubmissionPrResult =
  | { success: true; prUrl: string }
  | { success: false; reason: CreateSubmissionPrFailureReason };

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** fetch + ok-check + json-parse in one call. Returns the failure reason on any non-2xx response, never throws. */
async function githubRequest<T>(
  url: string,
  init: RequestInit,
  failReason: CreateSubmissionPrFailureReason,
): Promise<{ ok: true; data: T } | { ok: false; reason: CreateSubmissionPrFailureReason }> {
  const response = await fetch(url, init);
  if (!response.ok) return { ok: false, reason: failReason };
  return { ok: true, data: (await response.json()) as T };
}

/** Wrapped in backticks so GitHub renders it as text, never as a live @mention that notifies a real account. */
function prBody(entry: Project, submission: SubmissionInput): string {
  const lines = [
    "Opened automatically from a homepage submission.",
    "",
    `**Project:** ${submission.name}`,
    `**Description:** ${submission.description}`,
    `**Category:** ${submission.category}`,
    `**Source:** ${submission.sourceLink}`,
  ];
  if (submission.xHandle) {
    lines.push(`**Submitted by:** \`@${submission.xHandle.replace(/^@/, "")}\``);
  }
  lines.push("", "Review, research, and fill in the remaining fields before merging.", `id: \`${entry.id}\``);
  return lines.join("\n");
}

async function deleteBranch(branch: string, headers: HeadersInit): Promise<void> {
  try {
    await fetch(`${API_ROOT}/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, {
      method: "DELETE",
      headers,
    });
  } catch {
    // Best-effort cleanup only — the original failure reason is what gets reported either way.
  }
}

/**
 * Opens a PR adding one entry as its own file at src/data/entries/<id>/entry.json — never touches
 * any other entry's file, so two submissions landing at the same time can never conflict with each
 * other. Never merges — that's always a human's call.
 */
export async function createSubmissionPr(
  entry: Project,
  submission: SubmissionInput,
): Promise<CreateSubmissionPrResult> {
  const token = process.env.GITHUB_SUBMIT_TOKEN;
  if (!token) {
    return { success: false, reason: "missing_token" };
  }
  const headers = githubHeaders(token);
  const branch = `submission/${entry.id}`;
  const entryPath = `src/data/entries/${entry.id}/entry.json`;

  const ref = await githubRequest<{ object: { sha: string } }>(
    `${API_ROOT}/repos/${OWNER}/${REPO}/git/ref/heads/${BASE_BRANCH}`,
    { headers },
    "base_ref_lookup_failed",
  );
  if (!ref.ok) return { success: false, reason: ref.reason };
  const baseSha = ref.data.object.sha;

  const createRef = await githubRequest(
    `${API_ROOT}/repos/${OWNER}/${REPO}/git/refs`,
    { method: "POST", headers, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) },
    "branch_create_failed",
  );
  if (!createRef.ok) return { success: false, reason: createRef.reason };

  const entryContent = `${JSON.stringify(entry, null, 2)}\n`;
  const createEntryFile = await githubRequest(
    `${API_ROOT}/repos/${OWNER}/${REPO}/contents/${entryPath}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Add submitted project: ${entry.project}`,
        content: Buffer.from(entryContent, "utf-8").toString("base64"),
        branch,
      }),
    },
    "entry_file_create_failed",
  );
  if (!createEntryFile.ok) {
    await deleteBranch(branch, headers);
    return { success: false, reason: createEntryFile.reason };
  }

  const pr = await githubRequest<{ html_url: string }>(
    `${API_ROOT}/repos/${OWNER}/${REPO}/pulls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `Add submitted project: ${entry.project}`,
        head: branch,
        base: BASE_BRANCH,
        body: prBody(entry, submission),
      }),
    },
    "pr_create_failed",
  );
  if (!pr.ok) {
    await deleteBranch(branch, headers);
    return { success: false, reason: pr.reason };
  }

  return { success: true, prUrl: pr.data.html_url };
}
