import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { VisitorFeed } from "../VisitorFeed";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("VisitorFeed", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
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
