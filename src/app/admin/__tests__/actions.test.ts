import { beforeEach, describe, expect, test, vi } from "vitest";

const authenticate = vi.fn();
const changeAdminPassword = vi.fn();
vi.mock("@/lib/adminUsers", () => ({
  authenticate: (...a: unknown[]) => authenticate(...a),
  changePassword: (...a: unknown[]) => changeAdminPassword(...a),
}));

const startSession = vi.fn();
const endSession = vi.fn();
const requireAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({
  ADMIN_PATH: "/admin",
  LOGIN_PATH: "/admin/login",
  PASSWORD_CHANGED_PARAM: "changed",
  startSession: (...a: unknown[]) => startSession(...a),
  endSession: (...a: unknown[]) => endSession(...a),
  requireAdmin: (...a: unknown[]) => requireAdmin(...a),
}));

let currentIp = "203.0.113.1";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": currentIp }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

// Repeated characters keep secret scanners from mistaking fixtures for real passwords.
const CURRENT_PASSWORD = "c".repeat(16);
const NEW_PASSWORD = "n".repeat(16);

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const admin = { id: "7", email: "a@b.co", usingTempPassword: true, credentialVersion: "4" };
let ipCounter = 0;

async function loadActions() {
  vi.resetModules();
  return import("../actions");
}

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentIp = `198.51.100.${++ipCounter}`;
    requireAdmin.mockResolvedValue(admin);
  });

  describe("login", () => {
    test("rejects malformed input without ever touching the database", async () => {
      const { login } = await loadActions();

      const state = await login(undefined, form({ email: "not-an-email", password: "" }));

      expect(state.error).toBe("Enter your email and password.");
      expect(authenticate).not.toHaveBeenCalled();
      expect(startSession).not.toHaveBeenCalled();
    });

    test("wrong credentials get one generic message and no session", async () => {
      authenticate.mockResolvedValueOnce(null);
      const { login } = await loadActions();

      const state = await login(undefined, form({ email: "A@B.co", password: "wrong-password" }));

      expect(state).toEqual({ error: "Invalid email or password.", email: "a@b.co" });
      expect(startSession).not.toHaveBeenCalled();
    });

    test("an unknown email and a wrong password are indistinguishable to the caller", async () => {
      authenticate.mockResolvedValue(null);
      const { login } = await loadActions();

      const unknown = await login(undefined, form({ email: "nobody@example.com", password: "whatever-pass" }));
      const wrong = await login(undefined, form({ email: "a@b.co", password: "whatever-pass" }));

      expect(unknown.error).toBe(wrong.error);
    });

    test("correct credentials start a session and redirect to the admin page", async () => {
      authenticate.mockResolvedValueOnce(admin);
      startSession.mockResolvedValueOnce(true);
      const { login } = await loadActions();

      await expect(login(undefined, form({ email: "a@b.co", password: "right-password" }))).rejects.toThrow(
        "NEXT_REDIRECT:/admin",
      );

      expect(authenticate).toHaveBeenCalledWith("a@b.co", "right-password");
      expect(startSession).toHaveBeenCalledWith("7", "4");
    });

    test("a reset or password change that lands between the password check and the session means no sign-in", async () => {
      authenticate.mockResolvedValueOnce(admin);
      startSession.mockResolvedValueOnce(false);
      const { login } = await loadActions();

      const state = await login(undefined, form({ email: "a@b.co", password: "right-password" }));

      expect(state.error).toBe("Something went wrong. Try again.");
    });

    test("a failure while creating the session returns a generic error instead of throwing", async () => {
      authenticate.mockResolvedValueOnce(admin);
      startSession.mockRejectedValueOnce(new Error("connection reset"));
      const { login } = await loadActions();

      const state = await login(undefined, form({ email: "a@b.co", password: "right-password" }));

      expect(state.error).toBe("Something went wrong. Try again.");
    });

    test("a database failure returns a generic error instead of throwing or signing anyone in", async () => {
      authenticate.mockRejectedValueOnce(new Error("connection reset"));
      const { login } = await loadActions();

      const state = await login(undefined, form({ email: "a@b.co", password: "right-password" }));

      expect(state.error).toBe("Something went wrong. Try again.");
      expect(startSession).not.toHaveBeenCalled();
    });

    test("stops guessing at one account after 5 tries from one source, without locking out other accounts", async () => {
      authenticate.mockResolvedValue(null);
      const { login } = await loadActions();

      for (let i = 0; i < 5; i++) {
        await login(undefined, form({ email: "a@b.co", password: `guess-number-${i}` }));
      }
      authenticate.mockClear();

      const blocked = await login(undefined, form({ email: "a@b.co", password: "guess-number-6" }));
      expect(blocked.error).toMatch(/Too many attempts/);
      expect(authenticate).not.toHaveBeenCalled();

      const other = await login(undefined, form({ email: "c@d.co", password: "some-password" }));
      expect(other.error).toBe("Invalid email or password.");
    });

    test("a different source isn't blocked by someone else's failed guesses at the same account", async () => {
      authenticate.mockResolvedValue(null);
      const { login } = await loadActions();
      for (let i = 0; i < 6; i++) {
        await login(undefined, form({ email: "a@b.co", password: `guess-number-${i}` }));
      }

      currentIp = "192.0.2.99";
      const fromElsewhere = await login(undefined, form({ email: "a@b.co", password: "another-guess" }));

      expect(fromElsewhere.error).toBe("Invalid email or password.");
    });

    test("caps total attempts per source across accounts", async () => {
      authenticate.mockResolvedValue(null);
      const { login } = await loadActions();

      for (let i = 0; i < 30; i++) {
        await login(undefined, form({ email: `user${i}@example.com`, password: "some-password" }));
      }
      const blocked = await login(undefined, form({ email: "user99@example.com", password: "some-password" }));

      expect(blocked.error).toMatch(/Too many attempts/);
    });
  });

  describe("logout", () => {
    test("ends the session and sends the user to the login page", async () => {
      const { logout } = await loadActions();

      await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
      expect(endSession).toHaveBeenCalledTimes(1);
    });
  });

  describe("changePassword", () => {
    const valid = { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

    test("requires a signed-in admin before doing anything else", async () => {
      requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/login"));
      const { changePassword } = await loadActions();

      await expect(changePassword(undefined, form(valid))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
      expect(changeAdminPassword).not.toHaveBeenCalled();
    });

    test("returns field errors for a bad new password without touching the database", async () => {
      const { changePassword } = await loadActions();

      const state = await changePassword(undefined, form({ ...valid, newPassword: "short", confirmPassword: "short" }));

      expect(state.fieldErrors?.newPassword).toMatch(/at least 12/);
      expect(changeAdminPassword).not.toHaveBeenCalled();
    });

    test("reports a wrong current password on that field", async () => {
      changeAdminPassword.mockResolvedValueOnce("wrong_password");
      const { changePassword } = await loadActions();

      const state = await changePassword(undefined, form(valid));

      expect(state.fieldErrors?.currentPassword).toBeTruthy();
      expect(startSession).not.toHaveBeenCalled();
    });

    test("on success, changes the password for the signed-in admin only, then signs out and goes to the login page", async () => {
      changeAdminPassword.mockResolvedValueOnce("ok");
      const { changePassword } = await loadActions();

      await expect(changePassword(undefined, form(valid))).rejects.toThrow("NEXT_REDIRECT:/admin/login?changed=1");

      expect(changeAdminPassword).toHaveBeenCalledWith("7", CURRENT_PASSWORD, NEW_PASSWORD);
      expect(endSession).toHaveBeenCalledTimes(1);
      expect(startSession).not.toHaveBeenCalled();
    });

    test("tells the admin to sign in again when a reset landed first, and starts no session", async () => {
      changeAdminPassword.mockResolvedValueOnce("conflict");
      const { changePassword } = await loadActions();

      const state = await changePassword(undefined, form(valid));

      expect(state.error).toMatch(/Sign in again/);
      expect(endSession).not.toHaveBeenCalled();
    });

    test("a database failure returns a generic error and leaves the session alone", async () => {
      changeAdminPassword.mockRejectedValueOnce(new Error("connection reset"));
      const { changePassword } = await loadActions();

      const state = await changePassword(undefined, form(valid));

      expect(state.error).toBe("Something went wrong. Try again.");
      expect(endSession).not.toHaveBeenCalled();
    });

    test("rate-limits repeated attempts to guess the current password", async () => {
      changeAdminPassword.mockResolvedValue("wrong_password");
      const { changePassword } = await loadActions();

      for (let i = 0; i < 5; i++) await changePassword(undefined, form(valid));
      changeAdminPassword.mockClear();
      const blocked = await changePassword(undefined, form(valid));

      expect(blocked.error).toMatch(/Too many attempts/);
      expect(changeAdminPassword).not.toHaveBeenCalled();
    });
  });
});
