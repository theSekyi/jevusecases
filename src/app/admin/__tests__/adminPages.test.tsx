import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const requireAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("../actions", () => ({ logout: vi.fn(), changePassword: vi.fn() }));
vi.mock("@/components/admin/ChangePasswordForm", () => ({ ChangePasswordForm: () => <form aria-label="change password" /> }));

const { default: AdminPage } = await import("../page");
const { default: AccountPage } = await import("../account/page");

const admin = { id: "7", email: "a@b.co", usingTempPassword: false };

describe("admin dashboard", () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(admin);
  });

  test("redirects a signed-out visitor without rendering anything", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/login"));

    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });

  test("is a menu: links to traffic and account, and shows no form to fill in", async () => {
    render(await AdminPage());

    expect(screen.getByRole("link", { name: /Traffic/ })).toHaveAttribute("href", "/admin/traffic");
    expect(screen.getByRole("link", { name: /Account/ })).toHaveAttribute("href", "/admin/account");
    expect(screen.getByText("a@b.co")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "change password" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  test("says a temporary password is optional to change, only for accounts still on one", async () => {
    const { unmount } = render(await AdminPage());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();

    requireAdmin.mockResolvedValue({ ...admin, usingTempPassword: true });
    render(await AdminPage());
    expect(screen.getByRole("status")).toHaveTextContent(/optional/);
  });
});

describe("account page", () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(admin);
  });

  test("redirects a signed-out visitor without rendering anything", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/login"));

    await expect(AccountPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });

  test("shows the password form with a way back to the dashboard", async () => {
    render(await AccountPage());

    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "change password" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to ADMIN" })).toHaveAttribute("href", "/admin");
  });

  test("warns that changing the password signs you out, whatever kind of password the account has", async () => {
    const { unmount } = render(await AccountPage());
    expect(screen.getByText(/signs you out everywhere/)).toBeInTheDocument();
    expect(screen.queryByText(/temporary password/)).not.toBeInTheDocument();
    unmount();

    requireAdmin.mockResolvedValue({ ...admin, usingTempPassword: true });
    render(await AccountPage());
    expect(screen.getByText(/signs you out everywhere/)).toBeInTheDocument();
    expect(screen.getByText(/temporary password\. Changing it is optional/)).toBeInTheDocument();
  });
});
