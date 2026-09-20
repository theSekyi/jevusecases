import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { LinkClickSummary } from "@/lib/linkClicks";
import { MIN_LINK_CLICKERS } from "@/lib/linkKinds";
import { TRAFFIC_WINDOW_DAYS } from "@/lib/visitorFormat";
import { LinkClicks } from "../admin/LinkClicks";

const summary: LinkClickSummary = {
  clicks: 50,
  clickers: 20,
  kinds: [
    { kind: "project_open", label: "Opened a project", clickers: 15, clicks: 30 },
    { kind: "submit", label: "Submit a project", clickers: 5, clicks: 6 },
    { kind: "other", label: "Other", clickers: 3, clicks: 4 },
  ],
  projects: [
    { id: "guard", name: "jev-guard", opened: 10, followed: 4 },
    { id: "scout", name: "jev-scout", opened: 3, followed: 0 },
  ],
  hosts: [{ host: "github.com", clickers: 6 }],
};

describe("LinkClicks", () => {
  test("names the window and says the numbers are people, and what is left out", () => {
    render(<LinkClicks summary={summary} />);

    expect(screen.getByRole("region", { name: new RegExp(`WHAT VISITORS CLICK, LAST ${TRAFFIC_WINDOW_DAYS} DAYS`) })).toBeInTheDocument();
    expect(screen.getByText(/Each number is people, not clicks/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`fewer than ${MIN_LINK_CLICKERS} people appears only under`))).toBeInTheDocument();
  });

  test("lists each kind with its share of the people who clicked anything", () => {
    render(<LinkClicks summary={summary} />);

    const kinds = screen.getAllByRole("list")[0];
    const items = within(kinds).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Opened a project");
    expect(items[0]).toHaveTextContent("75%");
    expect(items[0]).toHaveTextContent("15 people");
    expect(items[2]).toHaveTextContent("Other");
  });

  test("shows how many people opened each project and how many went on to follow one of its links", () => {
    render(<LinkClicks summary={summary} />);

    const projects = screen.getAllByRole("list")[1];
    const [first, second] = within(projects).getAllByRole("listitem");
    expect(first).toHaveTextContent("jev-guard");
    expect(first).toHaveTextContent("10 people opened it");
    expect(first).toHaveTextContent("4 · 40%");
    expect(second).toHaveTextContent("0 · 0%");
  });

  test("lists where people went", () => {
    render(<LinkClicks summary={summary} />);

    const hosts = screen.getAllByRole("list")[2];
    expect(within(hosts).getByRole("listitem")).toHaveTextContent("github.com");
    expect(within(hosts).getByRole("listitem")).toHaveTextContent("6 people");
  });

  test("leaves out the project and site lists when nothing is big enough to name", () => {
    render(<LinkClicks summary={{ ...summary, projects: [], hosts: [] }} />);

    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.queryByText("MOST OPENED PROJECTS")).not.toBeInTheDocument();
  });

  test("says so when there are no clicks yet, instead of showing empty lists", () => {
    render(<LinkClicks summary={{ clicks: 0, clickers: 0, kinds: [], projects: [], hosts: [] }} />);

    expect(screen.getByText("No clicks recorded in this window yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
