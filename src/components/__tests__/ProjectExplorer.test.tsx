import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ProjectExplorer } from "../ProjectExplorer";
import { getProjects } from "@/lib/projects";

const projects = getProjects();
const cardTitles = () => screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
const search = () => screen.getByRole("searchbox", { name: "Search projects" });

function openByHash(id: string) {
  act(() => {
    window.location.hash = id;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("ProjectExplorer", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  test("leads with the message, a search box, and the strongest project featured", () => {
    render(<ProjectExplorer projects={projects} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What people replaced with Jev, and everything they're shipping with it.",
    );
    expect(search()).toHaveAttribute("placeholder", "Search 12 projects");
    expect(screen.getByText("Strongest evidence")).toBeInTheDocument();
    expect(screen.getByText("12 projects")).toBeInTheDocument();
    // The featured project is shown once, above the grid, not repeated inside it.
    expect(cardTitles().filter((title) => title === "jev-guard")).toHaveLength(1);
    expect(cardTitles()).toHaveLength(12);
  });

  test("typing filters as you go, and says how many are showing", () => {
    render(<ProjectExplorer projects={projects} />);

    fireEvent.change(search(), { target: { value: "haiku" } });

    expect(cardTitles()).toEqual(["jev-guard"]);
    expect(screen.getByText("Showing 1 of 12 projects")).toBeInTheDocument();
    expect(screen.queryByText("Strongest evidence")).not.toBeInTheDocument();
  });

  test("the filter chips show live counts that follow the search", () => {
    render(<ProjectExplorer projects={projects} />);

    expect(screen.getByRole("button", { name: /Replaces a paid tool/ })).toHaveTextContent("3");

    fireEvent.change(search(), { target: { value: "security" } });

    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Replaces a paid tool/ })).toHaveTextContent("1");
  });

  test("choosing a chip filters, marks it pressed, and choosing All undoes it", () => {
    render(<ProjectExplorer projects={projects} />);

    fireEvent.click(screen.getByRole("button", { name: /Replaces a paid tool/ }));

    expect(screen.getByRole("button", { name: /Replaces a paid tool/ })).toHaveAttribute("aria-pressed", "true");
    expect(cardTitles().sort()).toEqual(["is-jeven", "jev-guard", "openjev-sglang"]);

    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(cardTitles()).toHaveLength(12);
  });

  test("category and sort combine with the other filters", () => {
    render(<ProjectExplorer projects={projects} />);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "security" } });
    expect(cardTitles().sort()).toEqual(["jev-guard", "jrx (JEV Reflex)", "pkg-gate"]);

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "az" } });
    expect(cardTitles()).toEqual(["jev-guard", "jrx (JEV Reflex)", "pkg-gate"]);
    expect(screen.queryByText("Strongest evidence")).not.toBeInTheDocument();
  });

  test("shows a helpful empty state, and clearing brings everything back", () => {
    render(<ProjectExplorer projects={projects} />);

    fireEvent.change(search(), { target: { value: "zzzz" } });

    expect(screen.getByText("No projects match “zzzz”.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Submit a project" })).toHaveAttribute("href", "/submit");

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));

    expect(search()).toHaveValue("");
    expect(cardTitles()).toHaveLength(12);
  });

  test("pressing / jumps to search, but not while typing somewhere else", () => {
    render(
      <>
        <input aria-label="other" />
        <ProjectExplorer projects={projects} />
      </>,
    );

    fireEvent.keyDown(document.body, { key: "/" });
    expect(search()).toHaveFocus();

    screen.getByLabelText("other").focus();
    fireEvent.keyDown(screen.getByLabelText("other"), { key: "/" });
    expect(screen.getByLabelText("other")).toHaveFocus();
  });

  test("Escape clears the search first, then leaves it", () => {
    render(<ProjectExplorer projects={projects} />);
    fireEvent.change(search(), { target: { value: "haiku" } });

    fireEvent.keyDown(search(), { key: "Escape" });
    expect(search()).toHaveValue("");
  });

  describe("project panel", () => {
    test("every card is a link that opens its own panel through the URL hash", () => {
      render(<ProjectExplorer projects={projects} />);

      const link = screen.getByRole("link", { name: /Jev Trader/ });
      expect(link).toHaveAttribute("href", "#jarrodwatts-jev-trader");
      expect(link).toHaveAttribute("aria-haspopup", "dialog");
    });

    test("opens on a hash, showing the evidence, how Jev was used, and the links", () => {
      render(<ProjectExplorer projects={projects} />);

      openByHash("jarrodwatts-jev-trader");

      const panel = screen.getByRole("dialog", { name: "Jev Trader" });
      expect(within(panel).getByText("81 ms")).toBeInTheDocument();
      expect(within(panel).getByText("How it uses Jev")).toBeInTheDocument();
      expect(within(panel).getByRole("link", { name: "github.com/jarrodwatts/jev-trader" })).toHaveAttribute(
        "href",
        "https://github.com/jarrodwatts/jev-trader",
      );
      expect(within(panel).getByRole("link", { name: "@jarrodwatts" })).toHaveAttribute("href", "https://x.com/jarrodwatts");
      expect(document.body.style.overflow).toBe("hidden");
    });

    test("opens straight from a shared link and ignores a hash that is not a project", () => {
      window.history.replaceState(null, "", "/#ctatedev-ai-cli");
      const { unmount } = render(<ProjectExplorer projects={projects} />);
      expect(screen.getByRole("dialog", { name: "ai-cli" })).toBeInTheDocument();
      unmount();

      window.history.replaceState(null, "", "/#not-a-project");
      render(<ProjectExplorer projects={projects} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("closing clears the hash, restores scrolling and returns focus to the card", async () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
      render(<ProjectExplorer projects={projects} />);
      openByHash("jarrodwatts-jev-trader");

      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close/ }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(window.location.hash).toBe("");
      expect(document.body.style.overflow).toBe("");
      expect(screen.getByRole("link", { name: /Jev Trader/ })).toHaveFocus();
      vi.unstubAllGlobals();
    });

    test("clicking the dim backdrop closes it, clicking inside does not", () => {
      render(<ProjectExplorer projects={projects} />);
      openByHash("jarrodwatts-jev-trader");
      const panel = screen.getByRole("dialog");

      fireEvent.click(within(panel).getByRole("heading", { name: "Jev Trader" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.click(panel);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("shows only the sections a project has: no evidence, no recipe, no links", () => {
      render(<ProjectExplorer projects={projects} />);

      openByHash("jpschroeder-fsd-rebuild");

      const panel = screen.getByRole("dialog");
      expect(within(panel).queryByText("The evidence")).not.toBeInTheDocument();
      expect(within(panel).queryByText("Try it")).not.toBeInTheDocument();
    });

    test("offers a copy button for the install command and confirms the copy", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      render(<ProjectExplorer projects={projects} />);
      openByHash("ctatedev-ai-cli");

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));
      });

      expect(writeText).toHaveBeenCalledWith("npm install -g ai-cli");
      expect(screen.getByRole("button", { name: "Copy install command" })).toHaveTextContent("Copied");
      expect(screen.getByText("install command copied")).toBeInTheDocument();
    });

    test("says so when the copy fails", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
        configurable: true,
      });
      render(<ProjectExplorer projects={projects} />);
      openByHash("ctatedev-ai-cli");

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));
      });

      expect(screen.getByRole("button", { name: "Copy install command" })).toHaveTextContent("Copy failed");
    });
  });
});
