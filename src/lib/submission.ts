import { z } from "zod";

export const CATEGORIES = [
  "trading / on-chain agents",
  "security / guardrails",
  "dev tooling / CLI",
  "browser agents / automation",
  "robotics / simulation",
  "exploration / benchmarking",
  "novelty / joke",
  "agent tooling / skills",
  "infra / open reimplementation",
  "security / supply chain",
  "explainer / curation",
] as const;

const ALLOWED_SOURCE_HOSTS = ["github.com", "npmjs.com"];

function hasAllowedSourceHost(value: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(value).hostname;
  } catch {
    return false;
  }
  return ALLOWED_SOURCE_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

export const submissionSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  description: z.string().trim().min(1, "Description is required"),
  category: z.enum(CATEGORIES, { message: "Pick a category" }),
  sourceLink: z
    .string()
    .trim()
    .min(1, "Source link is required")
    .url("Enter a valid URL")
    .refine(
      hasAllowedSourceHost,
      `Only ${ALLOWED_SOURCE_HOSTS.join(" and ")} links are accepted`,
    ),
  xHandle: z.string().trim().optional(),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type SubmissionFieldErrors = Partial<Record<keyof SubmissionInput, string>>;

export function validateSubmission(
  values: Record<keyof SubmissionInput, string>,
): { success: true; data: SubmissionInput } | { success: false; errors: SubmissionFieldErrors } {
  const result = submissionSchema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: SubmissionFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof SubmissionInput | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { success: false, errors };
}
