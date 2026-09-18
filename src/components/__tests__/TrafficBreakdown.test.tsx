import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrafficBreakdown } from "../admin/TrafficBreakdown";
import type { TrafficSummary } from "@/lib/trafficStats";

const summary = (overrides: Partial<TrafficSummary>): TrafficSummary => ({
  views: 0,
  visitors: 0,
  returning: 0,
  rows: [],
  ...overrides,
});

describe("TrafficBreakdown", () => {
  test("shows page views, unique and returning visitors, and each country's share, visitors and views", () => {
    render(
      <TrafficBreakdown
        summary={summary({
          views: 40,
          visitors: 12,
          returning: 4,
          rows: [
            { kind: "country", country: "GB", views: 30, visitors: 8 },
            { kind: "country", country: "US", views: 10, visitors: 5 },
          ],
        })}
      />,
    );

    expect(screen.getByRole("region", { name: /LAST 7 DAYS/ })).toBeInTheDocument();
    expect(screen.getByText("PAGE VIEWS").nextSibling).toHaveTextContent("40");
    expect(screen.getByText("UNIQUE VISITORS").nextSibling).toHaveTextContent("12");
    expect(screen.getByText("RETURNING").nextSibling).toHaveTextContent("4");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("United Kingdom");
    expect(items[0]).toHaveTextContent("75%");
    expect(items[0]).toHaveTextContent("8 visitors");
    expect(items[0]).toHaveTextContent("30 page views");
    expect(items[1]).toHaveTextContent("United States");
    expect(items[1]).toHaveTextContent("5 visitors");
  });

  test("says what a visitor is and that no address is stored", () => {
    render(<TrafficBreakdown summary={summary({ views: 3, rows: [{ kind: "other", views: 3, visitors: 2 }] })} />);

    expect(screen.getByText(/one-way hash of the IP address/)).toBeInTheDocument();
    expect(screen.getByText(/two or more different days/)).toBeInTheDocument();
  });

  test("labels the folded and unlocated rows without naming any country", () => {
    render(
      <TrafficBreakdown
        summary={summary({
          views: 10,
          rows: [
            { kind: "unknown", views: 6, visitors: 0 },
            { kind: "other", views: 4, visitors: 2 },
          ],
        })}
      />,
    );

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  test("shows a sliver as '<0.1%' rather than 0.0%", () => {
    render(
      <TrafficBreakdown
        summary={summary({
          views: 5000,
          rows: [
            { kind: "country", country: "GB", views: 4999, visitors: 100 },
            { kind: "other", views: 1, visitors: 1 },
          ],
        })}
      />,
    );

    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("<0.1%");
  });

  test("says so when nothing was recorded, instead of showing invented numbers", () => {
    render(<TrafficBreakdown summary={summary({})} />);

    expect(screen.getByText("PAGE VIEWS").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("No page views recorded in this window.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
