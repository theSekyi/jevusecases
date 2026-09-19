import { z } from "zod";
import { CATEGORIES, projectSchema } from "@/lib/projectSchema";

const ALLOWED_SOURCE_HOSTS = ["github.com", "npmjs.com"];
const ALLOWED_SOURCE_HOST_PATTERN = /^([a-z0-9-]+\.)*(github|npmjs)\.com$/i;

function hasAllowedSourceHost(value: string): boolean {
  try {
    return ALLOWED_SOURCE_HOST_PATTERN.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** True when the entry schema accepts the link as `github`. Any other allowed link (npm, a gist) becomes `website`. */
export function isGithubSourceLink(value: string): boolean {
  return projectSchema.shape.github.safeParse(value).success;
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
    .regex(/^(@?[A-Za-z0-9_]{1,15})?$/, "Use up to 15 letters, numbers, or underscores")
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
