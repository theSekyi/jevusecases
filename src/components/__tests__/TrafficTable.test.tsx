import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrafficTable } from "../admin/TrafficTable";

describe("TrafficTable", () => {
  test("shows the total, and each country with its name, share and count", () => {
    render(
      <TrafficTable
        summary={{
          total: 40,
          rows: [
            { kind: "country", country: "GB", visits: 30 },
            { kind: "country", country: "US", visits: 10 },
          ],
        }}
      />,
    );

    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText(/LAST 7 DAYS/)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("United Kingdom");
    expect(items[0]).toHaveTextContent("75%");
    expect(items[0]).toHaveTextContent("30");
    expect(items[1]).toHaveTextContent("United States");
    expect(items[1]).toHaveTextContent("25%");
  });

  test("labels the folded and unlocated rows without naming any country", () => {
    render(
      <TrafficTable
        summary={{
          total: 10,
          rows: [
            { kind: "unknown", visits: 6 },
            { kind: "other", visits: 4 },
          ],
        }}
      />,
    );

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  test("says so when nothing was recorded, instead of showing invented numbers", () => {
    render(<TrafficTable summary={{ total: 0, rows: [] }} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No visits recorded in this window.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
