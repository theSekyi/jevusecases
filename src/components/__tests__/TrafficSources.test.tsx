import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrafficSources } from "../admin/TrafficSources";
import { MIN_SOURCE_VISITORS } from "@/lib/sourceRules";
import type { SourcesSummary } from "@/lib/trafficSources";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";

const summary: SourcesSummary = {
  visitors: 40,
  partialSince: null,
  collecting: false,
  rows: [
    { kind: "site", label: "Hacker News", visitors: 20 },
    { kind: "tag", label: "launch-post", via: "X", visitors: 10 },
    { kind: "direct", label: "Direct or unknown", visitors: 6 },
    { kind: "other", label: "Other sites and tags", visitors: 4 },
  ],
};

describe("TrafficSources", () => {
  test("lists each source with its visitors and share, biggest first", () => {
    render(<TrafficSources summary={summary} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Hacker News");
    expect(items[0]).toHaveTextContent("50%");
    expect(items[0]).toHaveTextContent("20 visitors");
    expect(items[3]).toHaveTextContent("Other sites and tags");
  });

  test("shows a tagged link as a tag, reads as separate words, and says which site the clicks came through", () => {
    render(<TrafficSources summary={summary} />);
    const item = screen.getAllByRole("listitem")[1];

    expect(within(item).getByText("TAG")).toBeInTheDocument();
    expect(item.textContent).toContain("TAG launch-post via X");
  });

  test("a tag with no named site shows just the tag", () => {
    render(<TrafficSources summary={{ ...summary, rows: [{ kind: "tag", label: "newsletter", via: null, visitors: 5 }], visitors: 5 }} />);

    expect(screen.getByRole("listitem")).not.toHaveTextContent("via");
  });

  test("says what 'Direct or unknown' contains", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.getByText(/Typed address, bookmark, or an app that doesn't say where a link came from/)).toBeInTheDocument();
  });

  test("explains what is counted, that only hostnames are kept, and the rules for a tag and for small sources", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.getByText(/Each visitor is counted once per source/)).toBeInTheDocument();
    expect(screen.getByText(/clicks around the site don't count/)).toBeInTheDocument();
    expect(screen.getByText(/hostname only, never the full address/)).toBeInTheDocument();
    expect(screen.getByText("?ref=name")).toBeInTheDocument();
    expect(screen.getByText(/letters, numbers, - and _, up to 40/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`fewer than ${MIN_SOURCE_VISITORS} visitors appears only under`))).toBeInTheDocument();
  });

  test("names the window and the total in its headings", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.getByRole("region", { name: new RegExp(`LAST ${TRAFFIC_WINDOW_DAYS} DAYS`) })).toBeInTheDocument();
    expect(screen.getByText("VISITORS (40)")).toBeInTheDocument();
  });

  test("says the numbers are partial, and from when, while arrival tracking is new", () => {
    render(<TrafficSources summary={{ ...summary, partialSince: "2026-09-19T14:30:00.000Z" }} />);

    expect(screen.getByRole("note")).toHaveTextContent("Counted from 19 September 2026");
    expect(screen.getByRole("note")).toHaveTextContent("fills in over the week");
  });

  test("says nothing about partial data once the whole window is covered", () => {
    render(<TrafficSources summary={summary} />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  test("says arrivals are being recorded when none has been yet, instead of a table", () => {
    render(<TrafficSources summary={{ visitors: 0, rows: [], partialSince: null, collecting: true }} />);

    expect(screen.getByText(/Arrivals are being recorded now/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("says so when the window has no arrivals, instead of showing an empty table", () => {
    render(<TrafficSources summary={{ visitors: 0, rows: [], partialSince: null, collecting: false }} />);

    expect(screen.getByText("No arrivals recorded in this window yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("a tag and a site with the same label are two rows, not one", () => {
    render(
      <TrafficSources
        summary={{
          visitors: 12,
          partialSince: null,
          collecting: false,
          rows: [
            { kind: "site", label: "X", visitors: 7 },
            { kind: "tag", label: "X", via: null, visitors: 5 },
          ],
        }}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
