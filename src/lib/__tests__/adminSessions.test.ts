import { createHash } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionUser,
  isSessionToken,
  SESSION_TTL_MS,
} from "../adminSessions";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const allValues = () => sqlMock.mock.calls.flatMap((call) => call.slice(1));
const statements = () => sqlMock.mock.calls.map((call) => (call[0] as string[]).join("?"));

describe("adminSessions", () => {
  afterEach(() => {
    sqlMock.mockReset();
  });

  describe("createSessionRecord", () => {
    test("returns a random token and stores only its hash", async () => {
      sqlMock.mockResolvedValue([{ token_hash: "x" }]);

      const session = await createSessionRecord("7", "3");

      expect(session).not.toBeNull();
      expect(session!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(allValues()).toContain(sha256(session!.token));
      expect(allValues()).not.toContain(session!.token);
      expect(session!.expiresAt.getTime() - Date.now()).toBeGreaterThan(SESSION_TTL_MS - 5000);
      expect(session!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(SESSION_TTL_MS);
    });

    test("only inserts while the account still has the credential version that was verified", async () => {
      sqlMock.mockResolvedValue([{ token_hash: "x" }]);

      await createSessionRecord("7", "3");

      expect(statements()[0]).toMatch(/u\.id = \?/);
      expect(statements()[0]).toContain("u.credential_version = ?");
      expect(allValues()).toContain("7");
      expect(allValues()).toContain("3");
    });

    test("returns null, creating nothing, when a reset or password change got there first", async () => {
      sqlMock.mockResolvedValueOnce([]);
      expect(await createSessionRecord("7", "3")).toBeNull();
    });

    test("clears expired sessions in the same statement, so login costs one round trip", async () => {
      sqlMock.mockResolvedValue([{ token_hash: "x" }]);

      await createSessionRecord("7", "3");

      expect(sqlMock).toHaveBeenCalledTimes(1);
      expect(statements()[0]).toContain("DELETE FROM admin_sessions WHERE expires_at < now()");
    });

    test("every session gets a different token", async () => {
      sqlMock.mockResolvedValue([{ token_hash: "x" }]);
      const first = await createSessionRecord("7", "0");
      const second = await createSessionRecord("7", "0");
      expect(first!.token).not.toBe(second!.token);
    });
  });

  describe("isSessionToken", () => {
    test("accepts exactly the shape createSessionRecord produces, and nothing else", async () => {
      sqlMock.mockResolvedValue([{ token_hash: "x" }]);
      const session = await createSessionRecord("7", "0");

      expect(isSessionToken(session!.token)).toBe(true);
      expect(isSessionToken("")).toBe(false);
      expect(isSessionToken("short")).toBe(false);
      expect(isSessionToken("a".repeat(44))).toBe(false);
      expect(isSessionToken(`${"a".repeat(42)}!`)).toBe(false);
      expect(isSessionToken(`${"a".repeat(42)}\n`)).toBe(false);
    });
  });

  describe("findSessionUser", () => {
    test("looks the token up by hash, and only for unexpired sessions", async () => {
      sqlMock.mockResolvedValueOnce([{ id: "7", email: "a@b.co", using_temp_password: false }]);

      const admin = await findSessionUser("some-token");

      expect(admin).toEqual({ id: "7", email: "a@b.co", usingTempPassword: false });
      expect(allValues()).toContain(sha256("some-token"));
      expect(allValues()).not.toContain("some-token");
      expect(statements()[0]).toContain("s.expires_at > now()");
    });

    test("returns null for an unknown or expired token", async () => {
      sqlMock.mockResolvedValueOnce([]);
      expect(await findSessionUser("nope")).toBeNull();
    });
  });

  test("deleteSessionRecord deletes by hash", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await deleteSessionRecord("some-token");
    expect(allValues()).toEqual([sha256("some-token")]);
    expect(statements()[0]).toContain("DELETE FROM admin_sessions");
  });
});
