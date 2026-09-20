import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { LinkClickSummary } from "@/lib/linkClicks";
import { MIN_LINK_CLICKERS } from "@/lib/linkKinds";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import { LinkClicks } from "../admin/LinkClicks";

const summary: LinkClickSummary = {
  clicks: 50,
  clickers: 20,
  tooFew: false,
  kinds: [
    { kind: "project_open", label: "Opened a project", clickers: 15, clicks: 30 },
    { kind: "submit", label: "Pressed Submit a project", clickers: 5, clicks: 6 },
    { kind: "other", label: "Other", clickers: 3, clicks: 4 },
  ],
  projects: [
    { id: "guard", name: "jev-guard", opened: 10, followed: 4 },
    { id: "scout", name: "jev-scout", opened: 3, followed: null },
    { id: null, name: "Other projects", opened: 4, followed: null },
  ],
  hosts: [
    { label: "github.com", clickers: 6, other: false },
    { label: "Other sites", clickers: 3, other: true },
  ],
};

const listNamed = (name: string) => screen.getByRole("list", { name });

describe("LinkClicks", () => {
  test("names the window, and says the numbers are people and what is left out", () => {
    render(<LinkClicks summary={summary} />);

    expect(screen.getByRole("region", { name: new RegExp(`WHAT VISITORS CLICK, LAST ${TRAFFIC_WINDOW_DAYS} DAYS`) })).toBeInTheDocument();
    expect(screen.getByText(/The main number is people/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`fewer than ${MIN_LINK_CLICKERS} people did is left out`))).toBeInTheDocument();
    expect(screen.getByText(/from a shared link, rather than a card, isn.t counted/)).toBeInTheDocument();
  });

  test("gives the totals in words", () => {
    render(<LinkClicks summary={summary} />);

    expect(screen.getByText("20 people clicked something, 50 clicks in all")).toBeInTheDocument();
  });

  test("lists each kind with its share of the people, the people, and the clicks", () => {
    render(<LinkClicks summary={summary} />);

    const items = within(listNamed("WHAT THEY DID")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Opened a project");
    expect(items[0]).toHaveTextContent("75%");
    expect(items[0]).toHaveTextContent("15 people");
    expect(items[0]).toHaveTextContent("30 clicks");
    expect(items[2]).toHaveTextContent("Other");
  });

  test("shows how many people opened each project and the share who then followed a link", () => {
    render(<LinkClicks summary={summary} />);

    const [first, second, third] = within(listNamed("MOST OPENED PROJECTS")).getAllByRole("listitem");
    expect(first).toHaveTextContent("jev-guard");
    expect(first).toHaveTextContent("10 people opened it");
    expect(first).toHaveTextContent("40% (4 people followed one of its source, announcement or author links)");
    expect(second).toHaveTextContent("Fewer than 3 people followed one of its links");
    expect(third).toHaveTextContent("Other projects");
  });

  test("never shows a follower count under the floor as a number", () => {
    render(<LinkClicks summary={summary} />);

    const row = within(listNamed("MOST OPENED PROJECTS")).getAllByRole("listitem")[1];
    expect(row.textContent).not.toMatch(/\b[0-2]\b.*followed/);
    expect(within(row).getByText("–")).toHaveAttribute("aria-hidden", "true");
  });

  test("lists where people went, and says which links that covers", () => {
    render(<LinkClicks summary={summary} />);

    const items = within(listNamed("WHERE THEY WENT")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("github.com");
    expect(items[0]).toHaveTextContent("6 people");
    expect(items[1]).toHaveTextContent("Other sites");
    expect(screen.getByText(/Source, announcement and author links only/)).toBeInTheDocument();
  });

  test("gives every list a heading a screen reader can name it by, and hides the column labels", () => {
    render(<LinkClicks summary={summary} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "WHAT THEY DID",
      "MOST OPENED PROJECTS",
      "WHERE THEY WENT",
    ]);
    for (const label of ["SHARE", "PEOPLE", "CLICKS", "OPENED", "FOLLOWED"]) {
      for (const element of screen.getAllByText(label)) expect(element).toHaveAttribute("aria-hidden", "true");
    }
  });

  test("leaves out the project and site lists when there is nothing to name", () => {
    render(<LinkClicks summary={{ ...summary, projects: [], hosts: [] }} />);

    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.queryByText("MOST OPENED PROJECTS")).not.toBeInTheDocument();
  });

  test("says so when there are no clicks yet, instead of showing empty lists", () => {
    render(<LinkClicks summary={{ clicks: 0, clickers: 0, tooFew: false, kinds: [], projects: [], hosts: [] }} />);

    expect(screen.getByText("No clicks recorded in this window yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("says there are too few people, and shows no numbers, when only a couple have clicked", () => {
    render(<LinkClicks summary={{ clicks: 0, clickers: 0, tooFew: true, kinds: [], projects: [], hosts: [] }} />);

    expect(screen.getByText(/Fewer than 3 people have clicked so far, so nothing is shown yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/people clicked something/)).not.toBeInTheDocument();
  });
});
