import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hashPassword } from "../password";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const verifyAgainstDummy = vi.fn();
vi.mock("../password", async () => {
  const actual = await vi.importActual<typeof import("../password")>("../password");
  return {
    ...actual,
    verifyAgainstDummy: (...args: unknown[]) => {
      verifyAgainstDummy(...args);
      return actual.verifyAgainstDummy(args[0] as string);
    },
  };
});

const {
  authenticate,
  changePassword,
  createInvitedUser,
  normalizeEmail,
  removeUser,
  resetToTemporaryPassword,
} = await import("../adminUsers");

const allQueryValues = () => sqlMock.mock.calls.flatMap((call) => call.slice(1));
const statements = () => sqlMock.mock.calls.map((call) => (call[0] as string[]).join("?"));

describe("adminUsers", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    verifyAgainstDummy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  describe("createInvitedUser", () => {
    test("stores only a hash of the temporary password, never the password itself", async () => {
      sqlMock.mockResolvedValueOnce([{ id: "1" }]);

      const result = await createInvitedUser("New@Example.com");

      expect(result?.email).toBe("new@example.com");
      expect(result?.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{20}$/);
      const values = allQueryValues();
      expect(values).not.toContain(result!.temporaryPassword);
      expect(values.some((value) => typeof value === "string" && value.startsWith("scrypt$"))).toBe(true);
      expect(values).toContain("new@example.com");
    });

    test("returns null instead of overwriting when the email already has an account", async () => {
      sqlMock.mockResolvedValueOnce([]);
      expect(await createInvitedUser("taken@example.com")).toBeNull();
    });
  });

  describe("authenticate", () => {
    test("returns the admin and the credential version, without any password hash, for the right password", async () => {
      const password_hash = await hashPassword("the-right-password");
      sqlMock.mockResolvedValueOnce([
        { id: "7", email: "a@b.co", password_hash, using_temp_password: true, credential_version: "4" },
      ]);

      const admin = await authenticate("A@B.co", "the-right-password");

      expect(admin).toEqual({ id: "7", email: "a@b.co", usingTempPassword: true, credentialVersion: "4" });
      expect(JSON.stringify(admin)).not.toContain("scrypt");
    });

    test("returns null for the wrong password", async () => {
      const password_hash = await hashPassword("the-right-password");
      sqlMock.mockResolvedValueOnce([
        { id: "7", email: "a@b.co", password_hash, using_temp_password: false, credential_version: "0" },
      ]);

      expect(await authenticate("a@b.co", "a-wrong-password")).toBeNull();
      expect(verifyAgainstDummy).not.toHaveBeenCalled();
    });

    test("an unknown email still does the same hashing work, so timing can't reveal which emails exist", async () => {
      sqlMock.mockResolvedValueOnce([]);

      expect(await authenticate("nobody@example.com", "whatever-password")).toBeNull();
      expect(verifyAgainstDummy).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetToTemporaryPassword", () => {
    test("returns null when there is no such account", async () => {
      sqlMock.mockResolvedValueOnce([]);
      expect(await resetToTemporaryPassword("nobody@example.com")).toBeNull();
    });

    test("swaps in a fresh hashed password, bumps the credential version, and revokes sessions, in one statement", async () => {
      sqlMock.mockResolvedValueOnce([{ id: "7" }]);

      const result = await resetToTemporaryPassword("A@b.co");

      expect(result).toMatchObject({ email: "a@b.co" });
      expect(result?.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{20}$/);
      expect(allQueryValues()).not.toContain(result!.temporaryPassword);
      expect(sqlMock).toHaveBeenCalledTimes(1);
      const [statement] = statements();
      expect(statement).toContain("using_temp_password = true");
      expect(statement).toContain("credential_version = credential_version + 1");
      expect(statement).toContain("DELETE FROM admin_sessions");
    });
  });

  describe("removeUser", () => {
    test("deletes by normalized email and says whether anything was there", async () => {
      sqlMock.mockResolvedValueOnce([{ id: "7" }]);
      expect(await removeUser(" A@B.co ")).toBe(true);
      expect(allQueryValues()).toEqual(["a@b.co"]);

      sqlMock.mockResolvedValueOnce([]);
      expect(await removeUser("nobody@example.com")).toBe(false);
    });
  });

  describe("changePassword", () => {
    test("rejects a wrong current password without changing anything", async () => {
      const password_hash = await hashPassword("current-password-1");
      sqlMock.mockResolvedValueOnce([{ password_hash, credential_version: "2" }]);

      expect(await changePassword("7", "not-the-current-one", "brand-new-password")).toBe("wrong_password");
      expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    test("reports a missing account", async () => {
      sqlMock.mockResolvedValueOnce([]);
      expect(await changePassword("999", "x", "brand-new-password")).toBe("not_found");
    });

    test("stores only a hash, clears the temporary flag, bumps the version, and revokes sessions in one statement", async () => {
      const password_hash = await hashPassword("current-password-1");
      sqlMock.mockResolvedValueOnce([{ password_hash, credential_version: "2" }]);
      sqlMock.mockResolvedValueOnce([{ id: "7" }]);

      const result = await changePassword("7", "current-password-1", "brand-new-password");

      expect(result).toBe("ok");
      expect(allQueryValues()).not.toContain("brand-new-password");
      expect(allQueryValues()).not.toContain("current-password-1");
      const update = statements()[1];
      expect(update).toContain("using_temp_password = false");
      expect(update).toContain("credential_version = credential_version + 1");
      expect(update).toContain("DELETE FROM admin_sessions");
    });

    test("only updates while the account still has the version that was read", async () => {
      const password_hash = await hashPassword("current-password-1");
      sqlMock.mockResolvedValueOnce([{ password_hash, credential_version: "2" }]);
      sqlMock.mockResolvedValueOnce([{ id: "7" }]);

      await changePassword("7", "current-password-1", "brand-new-password");

      expect(statements()[1]).toContain("credential_version = ?");
      expect(sqlMock.mock.calls[1].slice(1)).toContain("2");
    });

    test("reports a conflict, changing nothing, when a reset or another change got there first", async () => {
      const password_hash = await hashPassword("current-password-1");
      sqlMock.mockResolvedValueOnce([{ password_hash, credential_version: "2" }]);
      sqlMock.mockResolvedValueOnce([]);

      expect(await changePassword("7", "current-password-1", "brand-new-password")).toBe("conflict");
    });
  });
});
