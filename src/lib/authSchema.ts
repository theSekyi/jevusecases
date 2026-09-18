import { z } from "zod";

/** Long enough to stop guessing, short enough that a huge input can't be used to burn CPU. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** The one definition of a valid admin email, shared by login and the invite script. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(MAX_PASSWORD_LENGTH),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(MAX_PASSWORD_LENGTH),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "The new password has to differ from the current one",
  });

export type PasswordFieldErrors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;

export interface AuthFormState {
  error?: string;
  fieldErrors?: PasswordFieldErrors;
  email?: string;
  ok?: boolean;
}

/** First error message per field, in the shape the password form displays. */
export function firstFieldErrors(error: z.ZodError): PasswordFieldErrors {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !(field in result)) result[field] = issue.message;
  }
  return result;
}
