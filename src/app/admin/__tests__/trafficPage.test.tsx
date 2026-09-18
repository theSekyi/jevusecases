import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const requireAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }));

const getTrafficSummary = vi.fn();
vi.mock("@/lib/trafficStats", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trafficStats")>("@/lib/trafficStats");
  return { ...actual, getTrafficSummary: () => getTrafficSummary() };
});

const { default: TrafficPage } = await import("../traffic/page");

describe("traffic page", () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    getTrafficSummary.mockReset();
  });

  test("redirects a signed-out visitor before reading any traffic data", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/login"));

    await expect(TrafficPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(getTrafficSummary).not.toHaveBeenCalled();
  });

  test("renders the summary for a signed-in admin", async () => {
    requireAdmin.mockResolvedValueOnce({ id: "7" });
    getTrafficSummary.mockResolvedValueOnce({ total: 5, rows: [{ kind: "country", country: "GB", visits: 5 }] });

    render(await TrafficPage());

    expect(screen.getByRole("heading", { name: "Traffic" })).toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to ADMIN" })).toHaveAttribute("href", "/admin");
  });
});
