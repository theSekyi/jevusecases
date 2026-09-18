import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createSessionRecord = vi.fn();
const deleteSessionRecord = vi.fn();
const findSessionUser = vi.fn();
vi.mock("@/lib/adminSessions", async () => ({
  isSessionToken: (await vi.importActual<typeof import("@/lib/adminSessions")>("@/lib/adminSessions")).isSessionToken,
  createSessionRecord: (...a: unknown[]) => createSessionRecord(...a),
  deleteSessionRecord: (...a: unknown[]) => deleteSessionRecord(...a),
  findSessionUser: (...a: unknown[]) => findSessionUser(...a),
}));

const cookieJar = new Map<string, string>();
const cookieSet = vi.fn((name: string, value: string, _options?: Record<string, unknown>) => {
  void _options;
  cookieJar.set(name, value);
});
const cookieDelete = vi.fn((name: string) => void cookieJar.delete(name));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: cookieSet,
    delete: cookieDelete,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

const { endSession, getCurrentAdmin, LOGIN_PATH, requireAdmin, SESSION_COOKIE, startSession } = await import("../auth");

const RAW = "r".repeat(43);
const GOOD = "g".repeat(43);
const admin = { id: "7", email: "a@b.co", usingTempPassword: false };

describe("auth", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.clearAllMocks();
    deleteSessionRecord.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("startSession", () => {
    test("sets an httpOnly, lax, site-wide cookie holding the raw token that expires with the session", async () => {
      const expiresAt = new Date("2030-01-01T00:00:00Z");
      createSessionRecord.mockResolvedValueOnce({ token: RAW, expiresAt });

      expect(await startSession("7", "3")).toBe(true);

      expect(createSessionRecord).toHaveBeenCalledWith("7", "3");
      expect(cookieSet).toHaveBeenCalledWith(
        SESSION_COOKIE,
        RAW,
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt }),
      );
    });

    test("marks the cookie secure in production but not in local dev over http", async () => {
      createSessionRecord.mockResolvedValue({ token: RAW, expiresAt: new Date() });

      vi.stubEnv("NODE_ENV", "production");
      await startSession("7", "0");
      expect(cookieSet.mock.calls[0][2]).toMatchObject({ secure: true });

      vi.stubEnv("NODE_ENV", "development");
      await startSession("7", "0");
      expect(cookieSet.mock.calls[1][2]).toMatchObject({ secure: false });
    });

    test("sets no cookie and returns false when the credentials changed since they were verified", async () => {
      createSessionRecord.mockResolvedValueOnce(null);

      expect(await startSession("7", "3")).toBe(false);
      expect(cookieSet).not.toHaveBeenCalled();
    });

    test("revokes the session behind the browser's existing cookie instead of leaving it valid", async () => {
      cookieJar.set(SESSION_COOKIE, GOOD);
      createSessionRecord.mockResolvedValueOnce({ token: RAW, expiresAt: new Date() });

      await startSession("7", "0");

      expect(deleteSessionRecord).toHaveBeenCalledWith(GOOD);
    });

    test("still signs in when revoking the old session fails", async () => {
      cookieJar.set(SESSION_COOKIE, GOOD);
      deleteSessionRecord.mockRejectedValueOnce(new Error("db down"));
      createSessionRecord.mockResolvedValueOnce({ token: RAW, expiresAt: new Date() });

      expect(await startSession("7", "0")).toBe(true);
    });

    test("ignores an existing cookie that can't be a session token", async () => {
      cookieJar.set(SESSION_COOKIE, "junk");
      createSessionRecord.mockResolvedValueOnce({ token: RAW, expiresAt: new Date() });

      await startSession("7", "0");

      expect(deleteSessionRecord).not.toHaveBeenCalled();
    });
  });

  describe("endSession", () => {
    test("deletes the session row and the cookie", async () => {
      cookieJar.set(SESSION_COOKIE, RAW);

      await endSession();

      expect(deleteSessionRecord).toHaveBeenCalledWith(RAW);
      expect(cookieDelete).toHaveBeenCalledWith(SESSION_COOKIE);
    });

    test("with no cookie, touches no session row and doesn't throw", async () => {
      await endSession();

      expect(deleteSessionRecord).not.toHaveBeenCalled();
    });

    test("clears the cookie even when the database is unreachable", async () => {
      cookieJar.set(SESSION_COOKIE, RAW);
      deleteSessionRecord.mockRejectedValueOnce(new Error("db down"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(endSession()).resolves.toBeUndefined();

      expect(cookieDelete).toHaveBeenCalledWith(SESSION_COOKIE);
    });
  });

  describe("getCurrentAdmin / requireAdmin", () => {
    test("no cookie means signed out, without a database lookup", async () => {
      expect(await getCurrentAdmin()).toBeNull();
      expect(findSessionUser).not.toHaveBeenCalled();
    });

    test("a cookie the database doesn't recognise means signed out", async () => {
      cookieJar.set(SESSION_COOKIE, "f".repeat(43));
      findSessionUser.mockResolvedValueOnce(null);

      expect(await getCurrentAdmin()).toBeNull();
      expect(findSessionUser).toHaveBeenCalledWith("f".repeat(43));
    });

    test("a cookie that isn't shaped like a token is rejected without a database lookup", async () => {
      cookieJar.set(SESSION_COOKIE, "junk");

      expect(await getCurrentAdmin()).toBeNull();
      expect(findSessionUser).not.toHaveBeenCalled();
    });

    test("a valid session returns the admin", async () => {
      cookieJar.set(SESSION_COOKIE, GOOD);
      findSessionUser.mockResolvedValueOnce(admin);

      expect(await getCurrentAdmin()).toEqual(admin);
    });

    test("requireAdmin sends a signed-out visitor to the login page, never returning", async () => {
      await expect(requireAdmin()).rejects.toThrow(`NEXT_REDIRECT:${LOGIN_PATH}`);
    });

    test("requireAdmin returns the admin for a valid session", async () => {
      cookieJar.set(SESSION_COOKIE, GOOD);
      findSessionUser.mockResolvedValueOnce(admin);

      await expect(requireAdmin()).resolves.toEqual(admin);
    });
  });
});
