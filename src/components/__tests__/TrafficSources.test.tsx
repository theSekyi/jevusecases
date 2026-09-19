import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrafficSources } from "../admin/TrafficSources";
import type { SourcesSummary } from "@/lib/trafficSources";

const summary: SourcesSummary = {
  landings: 40,
  rows: [
    { kind: "site", label: "Hacker News", landings: 20 },
    { kind: "tag", label: "launch-post", via: "X", landings: 10 },
    { kind: "direct", label: "Direct or unknown", landings: 6 },
    { kind: "other", label: "Other sites", landings: 4 },
  ],
};

describe("TrafficSources", () => {
  test("lists each source with its landings and share, biggest first", () => {
    render(<TrafficSources summary={summary} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Hacker News");
    expect(items[0]).toHaveTextContent("50%");
    expect(items[0]).toHaveTextContent("20 landings");
    expect(items[3]).toHaveTextContent("Other sites");
  });

  test("shows a tagged link as a tag and says which site the click came through", () => {
    render(<TrafficSources summary={summary} />);
    const item = screen.getAllByRole("listitem")[1];

    expect(within(item).getByText("TAG")).toBeInTheDocument();
    expect(item).toHaveTextContent("launch-post via X");
  });

  test("says what 'Direct or unknown' contains", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.getByText(/Typed address, bookmark, or an app that doesn't say where a link came from/)).toBeInTheDocument();
  });

  test("explains what is counted, that only hostnames are kept, and how to tag a link", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.getByText(/Counts the first page of a visit, not clicks around the site/)).toBeInTheDocument();
    expect(screen.getByText(/by its hostname only, never the full address/, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("?ref=name")).toBeInTheDocument();
  });

  test("names the window and the total in its headings", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.getByRole("region", { name: /LAST 7 DAYS/ })).toBeInTheDocument();
    expect(screen.getByText("LANDINGS (40)")).toBeInTheDocument();
  });

  test("says so when there are no arrivals, instead of showing an empty table", () => {
    render(<TrafficSources summary={{ landings: 0, rows: [] }} />);

    expect(screen.getByText("No arrivals recorded in this window yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("wraps a long tag or hostname rather than stretching the page", () => {
    render(
      <TrafficSources
        summary={{ landings: 5, rows: [{ kind: "site", label: "a-very-long-hostname-with-many-parts.example.com", landings: 5 }] }}
      />,
    );

    expect(screen.getByText("a-very-long-hostname-with-many-parts.example.com")).toHaveClass("[overflow-wrap:anywhere]");
  });
});
