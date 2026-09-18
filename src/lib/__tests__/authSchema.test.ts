import { describe, expect, test } from "vitest";
import { changePasswordSchema, firstFieldErrors, loginSchema, MAX_PASSWORD_LENGTH } from "../authSchema";

describe("loginSchema", () => {
  test("trims and lowercases the email", () => {
    const result = loginSchema.safeParse({ email: "  Admin@Example.COM ", password: "pw" });
    expect(result.success && result.data.email).toBe("admin@example.com");
  });

  test("rejects a malformed email, an empty password, and an oversized password", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "pw" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(MAX_PASSWORD_LENGTH + 1) }).success).toBe(
      false,
    );
  });

  test("rejects non-string input instead of coercing it", () => {
    expect(loginSchema.safeParse({ email: null, password: null }).success).toBe(false);
    expect(loginSchema.safeParse({ email: ["a@b.co"], password: "pw" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const valid = { currentPassword: "old-password", newPassword: "a-much-better-one", confirmPassword: "a-much-better-one" };

  test("accepts a long-enough matching new password", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  test("requires at least 12 characters", () => {
    const result = changePasswordSchema.safeParse({ ...valid, newPassword: "short", confirmPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstFieldErrors(result.error).newPassword).toMatch(/at least 12/);
  });

  test("requires the confirmation to match", () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: "something-different" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstFieldErrors(result.error).confirmPassword).toMatch(/don't match/);
  });

  test("rejects reusing the current password", () => {
    const same = "the-same-password";
    const result = changePasswordSchema.safeParse({ currentPassword: same, newPassword: same, confirmPassword: same });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstFieldErrors(result.error).newPassword).toBeTruthy();
  });

  test("caps the length so a huge input can't be used to burn CPU", () => {
    const huge = "x".repeat(MAX_PASSWORD_LENGTH + 1);
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: huge, confirmPassword: huge }).success).toBe(
      false,
    );
  });
});

describe("firstFieldErrors", () => {
  test("keeps only the first message per field", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "", newPassword: "x", confirmPassword: "y" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = firstFieldErrors(result.error);
      expect(Object.keys(errors).sort()).toEqual(["confirmPassword", "currentPassword", "newPassword"]);
      expect(typeof errors.newPassword).toBe("string");
    }
  });
});
