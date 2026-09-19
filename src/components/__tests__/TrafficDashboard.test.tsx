import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { TrafficSummary } from "@/lib/trafficStats";
import { TrafficDashboard } from "../admin/TrafficDashboard";

// The real globe needs a canvas; what matters here is what the dashboard hands it.
const globeProps = vi.fn();
vi.mock("../admin/TrafficGlobe", () => ({
  TrafficGlobe: (props: Record<string, unknown>) => {
    globeProps(props);
    return <div data-testid="globe" />;
  },
}));


const summary: TrafficSummary = {
  views: 40,
  visitors: 12,
  returning: 3,
  rows: [
    { kind: "country", country: "GB", views: 30, visitors: 8 },
    { kind: "country", country: "US", views: 10, visitors: 4 },
  ],
};
const lastProps = () => globeProps.mock.calls.at(-1)![0] as {
  rows: unknown;
  highlighted: string | null;
  focus: { code: string } | null;
  onHighlight: (code: string | null) => void;
};

describe("TrafficDashboard", () => {
  beforeEach(() => {
    globeProps.mockClear();
  });

  test("shows the globe next to the list, both from the same summary", () => {
    render(<TrafficDashboard summary={summary} />);

    expect(screen.getByTestId("globe")).toBeInTheDocument();
    expect(lastProps().rows).toBe(summary.rows);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("hovering a row highlights that country on the globe, and leaving clears it", () => {
    render(<TrafficDashboard summary={summary} />);
    const row = screen.getByRole("button", { name: /United States/ });

    fireEvent.mouseEnter(row);
    expect(lastProps().highlighted).toBe("US");
    fireEvent.mouseLeave(row);
    expect(lastProps().highlighted).toBeNull();
  });

  test("hovering the globe highlights the matching row", () => {
    render(<TrafficDashboard summary={summary} />);

    act(() => lastProps().onHighlight("GB"));

    expect(screen.getByRole("button", { name: /United Kingdom/ })).toHaveClass("bg-bp-raised");
  });

  test("clicking a row asks the globe to turn to it, and clicking it again is a new request", () => {
    render(<TrafficDashboard summary={summary} />);
    const row = screen.getByRole("button", { name: /United Kingdom/ });

    fireEvent.click(row);
    const first = lastProps().focus;
    fireEvent.click(row);
    const second = lastProps().focus;

    expect(first).toEqual({ code: "GB" });
    expect(second).toEqual({ code: "GB" });
    // A different object each time: that is what tells the globe to turn again.
    expect(second).not.toBe(first);
  });
});
