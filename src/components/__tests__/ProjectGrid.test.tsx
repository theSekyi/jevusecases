import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectGrid } from "../ProjectGrid";
import { getProjects } from "@/lib/projects";

describe("ProjectGrid", () => {
  const projects = getProjects();

  test("shows every project under the ALL lens by default", () => {
    render(<ProjectGrid projects={projects} />);
    expect(screen.getByText(`${projects.length} OF ${projects.length}`)).toBeInTheDocument();
    expect(screen.getByText("Jev Trader")).toBeInTheDocument();
  });

  test("clicking REPLACE filters down to only projects with a verdict", () => {
    render(<ProjectGrid projects={projects} />);

    fireEvent.click(screen.getByRole("button", { name: /REPLACE/i }));

    expect(screen.getByText("3 OF " + projects.length)).toBeInTheDocument();
    expect(screen.getByText("jev-guard")).toBeInTheDocument();
    expect(screen.queryByText("Jev Trader")).not.toBeInTheDocument();
  });

  test("clicking back to ALL restores the full grid", () => {
    render(<ProjectGrid projects={projects} />);

    fireEvent.click(screen.getByRole("button", { name: /BENCHMARK/i }));
    fireEvent.click(screen.getByRole("button", { name: /^ALL/i }));

    expect(screen.getByText(`${projects.length} OF ${projects.length}`)).toBeInTheDocument();
  });

  test("every visible card links to its real source, when it has one", () => {
    render(<ProjectGrid projects={projects} />);
    const link = screen.getByText("github.com/jarrodwatts/jev-trader");
    expect(link.closest("a")).toHaveAttribute("href", "https://github.com/jarrodwatts/jev-trader");
  });
});
