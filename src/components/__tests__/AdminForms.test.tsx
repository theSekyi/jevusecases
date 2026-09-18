import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const login = vi.fn();
const changePassword = vi.fn();
vi.mock("@/app/admin/actions", () => ({
  login: (...a: unknown[]) => login(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
}));

const { LoginForm } = await import("../admin/LoginForm");
const { ChangePasswordForm } = await import("../admin/ChangePasswordForm");

// Repeated characters keep secret scanners from mistaking fixtures for real passwords.
const CURRENT_PASSWORD = "c".repeat(16);
const NEW_PASSWORD = "n".repeat(16);

async function submit(container: HTMLElement) {
  await act(async () => {
    fireEvent.submit(container.querySelector("form")!);
  });
}

describe("LoginForm", () => {
  beforeEach(() => {
    login.mockReset();
  });

  test("renders labelled email and password fields, with the right autocomplete hints", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("EMAIL")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("PASSWORD")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("PASSWORD")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  test("shows the server's error and keeps the email the user typed", async () => {
    login.mockResolvedValueOnce({ error: "Invalid email or password.", email: "a@b.co" });
    const { container } = render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("EMAIL"), { target: { value: "a@b.co" } });

    await submit(container);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByLabelText("EMAIL")).toHaveValue("a@b.co");
  });

  test("never puts a password in the page after a failed attempt", async () => {
    login.mockResolvedValueOnce({ error: "Invalid email or password.", email: "a@b.co" });
    const { container } = render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("PASSWORD"), { target: { value: "super-secret-guess" } });

    await submit(container);

    expect(container.innerHTML).not.toContain("super-secret-guess");
  });
});

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    changePassword.mockReset();
  });

  function fill(current: string, next: string, confirm: string) {
    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: current } });
    fireEvent.change(screen.getByLabelText("NEW PASSWORD"), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("CONFIRM NEW PASSWORD"), { target: { value: confirm } });
  }

  test("shows a field error next to the field it belongs to", async () => {
    changePassword.mockResolvedValueOnce({ fieldErrors: { currentPassword: "That isn't your current password" } });
    const { container } = render(<ChangePasswordForm />);
    fill(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);

    await submit(container);

    expect(await screen.findByText("That isn't your current password")).toBeInTheDocument();
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("NEW PASSWORD")).toHaveAttribute("aria-invalid", "false");
  });

  test("catches a typo in the browser: no action call, and the fields keep what was typed", async () => {
    const { container } = render(<ChangePasswordForm />);
    fill(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD.slice(0, -1) + "x");

    await submit(container);

    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText("CONFIRM NEW PASSWORD")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveValue(CURRENT_PASSWORD);
    expect(screen.getByLabelText("NEW PASSWORD")).toHaveValue(NEW_PASSWORD);
  });

  test("flags a too-short new password before the server sees it", async () => {
    const { container } = render(<ChangePasswordForm />);
    fill(CURRENT_PASSWORD, "short", "short");

    await submit(container);

    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText("NEW PASSWORD")).toHaveAttribute("aria-invalid", "true");
  });

  test("hints at the minimum length up front", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument();
  });
});
