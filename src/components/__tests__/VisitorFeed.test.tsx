import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { VisitorFeed } from "../VisitorFeed";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function stubScreen(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

describe("VisitorFeed", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("on a screen too small to show it, it neither polls nor renders", async () => {
    stubScreen(false);
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ events: [{ id: 1, country: "US", flag: "🇺🇸", path: "/", createdAt: new Date().toISOString() }] }),
    );

    const { container } = render(<VisitorFeed />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("is labelled as live, and lists recent visits with the newest most visible", async () => {
    stubScreen(true);
    const now = Date.now();
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        events: [
          { id: 2, country: "US", flag: "🇺🇸", path: "/submit", createdAt: new Date(now).toISOString() },
          { id: 1, country: "GB", flag: "🇬🇧", path: "/", createdAt: new Date(now - 30_000).toISOString() },
        ],
      }),
    );

    render(<VisitorFeed />);

    const region = await screen.findByRole("region", { name: "Live visitor activity" });
    expect(within(region).getByText("Live")).toBeInTheDocument();
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("United States");
    expect(items[1]).toHaveTextContent("United Kingdom");
    expect(Number(items[0].style.opacity)).toBeGreaterThan(Number(items[1].style.opacity));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders nothing before the first poll resolves", () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ events: [] }));
    const { container } = render(<VisitorFeed />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders a country, flag, and path once events load", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        events: [{ id: 1, country: "US", flag: "🇺🇸", path: "/submit", createdAt: new Date().toISOString() }],
      }),
    );

    render(<VisitorFeed />);

    expect(await screen.findByText("United States")).toBeInTheDocument();
    expect(screen.getByText("/submit")).toBeInTheDocument();
    expect(screen.getByText("0s ago")).toBeInTheDocument();
  });

  test("falls back to a generic label when country is unknown (e.g. local dev)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        events: [{ id: 1, country: null, flag: null, path: "/", createdAt: new Date().toISOString() }],
      }),
    );

    render(<VisitorFeed />);

    expect(await screen.findByText("Somewhere")).toBeInTheDocument();
  });

  test("a failed poll leaves the feed empty rather than throwing", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    render(<VisitorFeed />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/reading/)).not.toBeInTheDocument();
  });

  test("polls again on the interval and stops on unmount", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ events: [] }));

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<VisitorFeed />));
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
