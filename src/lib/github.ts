import type { Project } from "@/lib/projects";

const OWNER = "theSekyi";
const REPO = "jevusecases";
const BASE_BRANCH = "main";
const DATA_PATH = "src/data/projects.json";
const API_ROOT = "https://api.github.com";

export interface SubmissionSummary {
  name: string;
  description: string;
  category: string;
  sourceLink: string;
  xHandle?: string;
}

export type CreateSubmissionPrResult =
  | { success: true; prUrl: string }
  | { success: false; reason: string };

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function prBody(entry: Project, submission: SubmissionSummary): string {
  const lines = [
    "Opened automatically from a homepage submission.",
    "",
    `**Project:** ${submission.name}`,
    `**Description:** ${submission.description}`,
    `**Category:** ${submission.category}`,
    `**Source:** ${submission.sourceLink}`,
  ];
  if (submission.xHandle) {
    lines.push(`**Submitted by:** @${submission.xHandle.replace(/^@/, "")}`);
  }
  lines.push("", "Review, research, and fill in the remaining fields before merging.", `id: \`${entry.id}\``);
  return lines.join("\n");
}

/** Opens a PR adding one entry to the data file: a new branch, one file update, then a pull request. Never merges — that's always a human's call. */
export async function createSubmissionPr(
  entry: Project,
  submission: SubmissionSummary,
): Promise<CreateSubmissionPrResult> {
  const token = process.env.GITHUB_SUBMIT_TOKEN;
  if (!token) {
    return { success: false, reason: "missing_token" };
  }

  const headers = githubHeaders(token);
  const branch = `submission/${entry.id}`;

  const refResponse = await fetch(`${API_ROOT}/repos/${OWNER}/${REPO}/git/ref/heads/${BASE_BRANCH}`, {
    headers,
  });
  if (!refResponse.ok) return { success: false, reason: "base_ref_lookup_failed" };
  const refData = (await refResponse.json()) as { object: { sha: string } };
  const baseSha = refData.object.sha;

  const createRefResponse = await fetch(`${API_ROOT}/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!createRefResponse.ok) return { success: false, reason: "branch_create_failed" };

  const contentResponse = await fetch(
    `${API_ROOT}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BASE_BRANCH}`,
    { headers },
  );
  if (!contentResponse.ok) return { success: false, reason: "data_file_lookup_failed" };
  const contentData = (await contentResponse.json()) as { content: string; sha: string };

  let projects: unknown;
  try {
    projects = JSON.parse(Buffer.from(contentData.content, "base64").toString("utf-8"));
  } catch {
    return { success: false, reason: "data_file_unparseable" };
  }
  if (!Array.isArray(projects)) {
    return { success: false, reason: "data_file_unparseable" };
  }

  const updatedContent = `${JSON.stringify([...projects, entry], null, 2)}\n`;

  const updateResponse = await fetch(`${API_ROOT}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Add submitted project: ${entry.project}`,
      content: Buffer.from(updatedContent, "utf-8").toString("base64"),
      sha: contentData.sha,
      branch,
    }),
  });
  if (!updateResponse.ok) return { success: false, reason: "data_file_update_failed" };

  const prResponse = await fetch(`${API_ROOT}/repos/${OWNER}/${REPO}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `Add submitted project: ${entry.project}`,
      head: branch,
      base: BASE_BRANCH,
      body: prBody(entry, submission),
    }),
  });
  if (!prResponse.ok) return { success: false, reason: "pr_create_failed" };

  const prData = (await prResponse.json()) as { html_url: string };
  return { success: true, prUrl: prData.html_url };
}
