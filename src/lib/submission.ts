import { z } from "zod";
import { CATEGORIES } from "@/lib/projectSchema";

const ALLOWED_SOURCE_HOSTS = ["github.com", "npmjs.com"];
const ALLOWED_SOURCE_HOST_PATTERN = /^([a-z0-9-]+\.)*(github|npmjs)\.com$/i;
const GITHUB_HOST_PATTERN = /^([a-z0-9-]+\.)*github\.com$/i;

function hasAllowedSourceHost(value: string): boolean {
  try {
    return ALLOWED_SOURCE_HOST_PATTERN.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** True when a URL already known to pass the source-link allowlist is a github.com link rather than npmjs.com. */
export function isGithubSourceLink(value: string): boolean {
  try {
    return GITHUB_HOST_PATTERN.test(new URL(value).hostname);
  } catch {
    return false;
  }
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
  xHandle: z
    .string()
    .trim()
    .max(15, "X handles are at most 15 characters")
    .regex(/^@?[A-Za-z0-9_]*$/, "Use only letters, numbers, and underscores")
    .optional(),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type SubmissionFieldErrors = Partial<Record<keyof SubmissionInput, string>>;

export function validateSubmission(
  values: unknown,
): { success: true; data: SubmissionInput } | { success: false; errors: SubmissionFieldErrors } {
  const result = submissionSchema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const { fieldErrors } = result.error.flatten();
  const errors: SubmissionFieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    errors[field as keyof SubmissionInput] = messages?.[0];
  }
  return { success: false, errors };
}
