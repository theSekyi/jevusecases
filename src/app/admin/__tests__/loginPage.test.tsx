import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getCurrentAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({
  ADMIN_PATH: "/admin",
  PASSWORD_CHANGED_PARAM: "changed",
  getCurrentAdmin: () => getCurrentAdmin(),
}));
vi.mock("@/components/admin/LoginForm", () => ({ LoginForm: () => <form aria-label="login" /> }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

const { default: LoginPage } = await import("../login/page");

const renderPage = async (params: Record<string, string | undefined>) =>
  render(await LoginPage({ searchParams: Promise.resolve(params) }));

describe("login page", () => {
  beforeEach(() => {
    getCurrentAdmin.mockReset();
    getCurrentAdmin.mockResolvedValue(null);
  });

  test("shows the sign-in form without a notice by default", async () => {
    await renderPage({});

    expect(screen.getByRole("form", { name: "login" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("tells the admin their password was changed when they arrive from a change", async () => {
    await renderPage({ changed: "1" });

    expect(screen.getByRole("status")).toHaveTextContent("Password changed. Sign in with your new password.");
  });

  test("ignores any other value for the notice parameter", async () => {
    await renderPage({ changed: "yes" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("sends someone who is already signed in to the admin page", async () => {
    getCurrentAdmin.mockResolvedValue({ id: "7" });

    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/admin");
  });
});
