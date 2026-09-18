import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "../Hero";
import { getProjects } from "@/lib/projects";

describe("Hero", () => {
  const projects = getProjects();

  test("shows the real total count of tracked builds", () => {
    render(<Hero projects={projects} />);
    expect(screen.getByText(new RegExp(`${projects.length} builds tracked total`))).toBeInTheDocument();
  });

  test("links to the submit form", () => {
    render(<Hero projects={projects} />);
    expect(screen.getByRole("link", { name: "Submit a project" })).toHaveAttribute("href", "/submit");
  });

  test("shows the first few real projects in the log", () => {
    render(<Hero projects={projects} />);
    expect(screen.getByText(/Jev Trader/)).toBeInTheDocument();
  });
});
