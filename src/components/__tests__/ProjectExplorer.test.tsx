import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectExplorer } from "../ProjectExplorer";
import { getProjects } from "@/lib/projects";
import { PAGE_SIZE } from "@/lib/usePages";
import { FIXTURE_PROJECTS, fsd, guard, makeProject, trader } from "@/lib/__tests__/fixtures";

const cardTitles = () => screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
const search = () => screen.getByRole("searchbox", { name: "Search projects" });

/** What the browser does when the URL hash changes, without a click. */
function goToHash(id: string) {
  act(() => {
    window.location.hash = id;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("ProjectExplorer", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(async () => {
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
    // jsdom finishes some history changes in a later task; let them land before the next test resets the URL.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test("leads with the message, a search box, and the strongest project featured", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What people replaced with Jev, and everything they're shipping with it.",
    );
    expect(search()).toHaveAttribute("placeholder", `Search ${FIXTURE_PROJECTS.length} projects`);
    expect(screen.getByText("Strongest evidence")).toBeInTheDocument();
    expect(screen.getByText(`${FIXTURE_PROJECTS.length} projects`)).toBeInTheDocument();
    // The featured project is shown once, above the grid, not repeated inside it.
    expect(cardTitles().filter((title) => title === "jev-guard")).toHaveLength(1);
    expect(cardTitles()).toHaveLength(FIXTURE_PROJECTS.length);
  });

  test("renders the real projects, and opens each one's panel without throwing", () => {
    const real = getProjects();
    render(<ProjectExplorer projects={real} />);

    // The featured card, then one page.
    expect(cardTitles()).toHaveLength(Math.min(real.length, PAGE_SIZE + 1));
    for (const project of real) {
      goToHash(project.id);
      expect(screen.getByRole("dialog", { name: project.project })).toBeInTheDocument();
    }
  });

  describe("with more projects than fit on one page", () => {
    // Named so A to Z order matches creation order; none has evidence, so nothing is featured.
    const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => {
      const n = String(i).padStart(3, "0");
      return makeProject({ id: `p${n}`, project: `Project ${n}` });
    });
    const showMore = () => screen.getByRole("button", { name: /^Show \d+ more$/ });

    test("shows one page, counts every project, and adds a page per click", () => {
      render(<ProjectExplorer projects={many} />);

      expect(cardTitles()).toHaveLength(PAGE_SIZE);
      expect(screen.getByText(`${many.length} projects`)).toBeInTheDocument();

      fireEvent.click(showMore());
      expect(cardTitles()).toHaveLength(PAGE_SIZE * 2);
      expect(showMore()).toHaveTextContent("Show 3 more");

      fireEvent.click(showMore());
      expect(cardTitles()).toHaveLength(many.length);
      expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).not.toBeInTheDocument();
    });

    test("moves focus to the first new card", async () => {
      render(<ProjectExplorer projects={many} />);

      fireEvent.click(showMore());

      await waitFor(() => expect(screen.getByRole("link", { name: new RegExp(many[PAGE_SIZE].project) })).toHaveFocus());
    });

    test("a new search starts again at one page, and so does going back", () => {
      render(<ProjectExplorer projects={many} />);
      fireEvent.click(showMore());

      fireEvent.change(search(), { target: { value: "project" } });
      expect(cardTitles()).toHaveLength(PAGE_SIZE);

      fireEvent.change(search(), { target: { value: "" } });
      expect(cardTitles()).toHaveLength(PAGE_SIZE);
    });

    test("a link to a project past the first page opens it, and closing returns focus to its card", async () => {
      render(<ProjectExplorer projects={many} />);
      const last = many.at(-1)!;

      goToHash(last.id);
      expect(screen.getByRole("dialog", { name: last.project })).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close/ }));
      await waitFor(() => expect(screen.getByRole("link", { name: new RegExp(last.project) })).toHaveFocus());
    });
  });

  test("typing filters as you go, and says how many are showing", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    fireEvent.change(search(), { target: { value: "haiku" } });

    expect(cardTitles()).toEqual(["jev-guard"]);
    expect(screen.getByText(`Showing 1 of ${FIXTURE_PROJECTS.length} projects`)).toBeInTheDocument();
    expect(screen.queryByText("Strongest evidence")).not.toBeInTheDocument();
  });

  test("the filter chips show live counts that follow the search", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    expect(screen.getByRole("button", { name: /Replaces a paid tool/ })).toHaveTextContent("3");

    fireEvent.change(search(), { target: { value: "security" } });

    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Replaces a paid tool/ })).toHaveTextContent("1");
  });

  test("choosing a chip filters, marks it pressed, and choosing All undoes it", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    fireEvent.click(screen.getByRole("button", { name: /Replaces a paid tool/ }));

    expect(screen.getByRole("button", { name: /Replaces a paid tool/ })).toHaveAttribute("aria-pressed", "true");
    expect(cardTitles().sort()).toEqual(["is-jeven", "jev-guard", "openjev-sglang"]);

    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(cardTitles()).toHaveLength(FIXTURE_PROJECTS.length);
  });

  test("category and sort combine with the other filters", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "security" } });
    expect(cardTitles().sort()).toEqual(["jev-guard", "pkg-gate"]);

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "az" } });
    expect(cardTitles()).toEqual(["jev-guard", "pkg-gate"]);
    expect(screen.queryByText("Strongest evidence")).not.toBeInTheDocument();
  });

  test("shows a helpful empty state, and clearing brings everything back", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    fireEvent.change(search(), { target: { value: "zzzz" } });

    expect(screen.getByText("No projects match “zzzz”.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Submit a project" })).toHaveAttribute("href", "/submit");

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));

    expect(search()).toHaveValue("");
    expect(cardTitles()).toHaveLength(FIXTURE_PROJECTS.length);
  });

  test("a long unbroken query wraps instead of stretching the page", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

    fireEvent.change(search(), { target: { value: "https://example.com/a/very/long/path/with/no/spaces/at/all" } });

    expect(screen.getByText(/No projects match/)).toHaveClass("[overflow-wrap:anywhere]");
  });

  test("the Clear button empties the search and keeps focus in it", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
    fireEvent.change(search(), { target: { value: "haiku" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(search()).toHaveValue("");
    expect(search()).toHaveFocus();
  });

  test("pressing / jumps to search, but not while typing somewhere else", () => {
    render(
      <>
        <input aria-label="other" />
        <ProjectExplorer projects={FIXTURE_PROJECTS} />
      </>,
    );

    fireEvent.keyDown(document.body, { key: "/" });
    expect(search()).toHaveFocus();

    screen.getByLabelText("other").focus();
    fireEvent.keyDown(screen.getByLabelText("other"), { key: "/" });
    expect(screen.getByLabelText("other")).toHaveFocus();
  });

  test("Escape clears the search first, and only then leaves it", () => {
    render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
    search().focus();
    fireEvent.change(search(), { target: { value: "haiku" } });

    fireEvent.keyDown(search(), { key: "Escape" });
    expect(search()).toHaveValue("");
    expect(search()).toHaveFocus();

    fireEvent.keyDown(search(), { key: "Escape" });
    expect(search()).not.toHaveFocus();
  });

  describe("project panel", () => {
    test("every card is a link that opens its own panel through the URL hash", () => {
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

      const link = screen.getByRole("link", { name: /Jev Trader/ });
      expect(link).toHaveAttribute("href", "#trader");
      expect(link).toHaveAttribute("aria-haspopup", "dialog");
    });

    test("a plain click opens the panel and adds one history entry; a modified click is left to the browser", () => {
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      const push = vi.spyOn(window.history, "pushState");
      const link = screen.getByRole("link", { name: /Jev Trader/ });

      fireEvent.click(link, { metaKey: true });
      expect(push).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(link);
      expect(push).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("dialog", { name: "Jev Trader" })).toBeInTheDocument();
      expect(window.location.hash).toBe("#trader");
      push.mockRestore();
    });

    test("shows the evidence, how Jev was used, and the links", () => {
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

      goToHash("guard");

      const panel = screen.getByRole("dialog", { name: "jev-guard" });
      expect(within(panel).getByText("3.4x faster, 28x cheaper vs Haiku 4.5")).toBeInTheDocument();
      expect(within(panel).getByText("How it uses Jev")).toBeInTheDocument();
      expect(within(panel).getByRole("link", { name: "github.com/example/jev-guard" })).toHaveAttribute(
        "href",
        "https://github.com/example/jev-guard",
      );
      expect(within(panel).getByText(/added 17 September 2026/)).toBeInTheDocument();
      expect(document.body.style.overflow).toBe("hidden");
    });

    test("links an author's X handle only when it is a real handle", () => {
      render(<ProjectExplorer projects={[makeProject({ id: "a", author: "@ok_name" }), makeProject({ id: "b", author: "not a handle" })]} />);

      goToHash("a");
      expect(within(screen.getByRole("dialog")).getByRole("link", { name: "@ok_name" })).toHaveAttribute(
        "href",
        "https://x.com/ok_name",
      );

      goToHash("b");
      expect(within(screen.getByRole("dialog")).queryByRole("link", { name: "not a handle" })).not.toBeInTheDocument();
    });

    test("a malformed date can't break the page: the panel opens and just leaves the date out", () => {
      render(<ProjectExplorer projects={[makeProject({ id: "odd", project: "Odd", date_found: "2026-9-7", author: "@odd" })]} />);

      goToHash("odd");

      const panel = screen.getByRole("dialog", { name: "Odd" });
      expect(within(panel).queryByText(/added/)).not.toBeInTheDocument();
      expect(within(panel).getByText("@odd")).toBeInTheDocument();
    });

    test("opens straight from a shared link and ignores a hash that is not a project", () => {
      window.history.replaceState(null, "", "/#cli");
      const { unmount } = render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      expect(screen.getByRole("dialog", { name: "ai-cli" })).toBeInTheDocument();
      unmount();

      window.history.replaceState(null, "", "/#not-a-project");
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("closing a panel opened from a shared link clears the hash and restores scrolling", async () => {
      window.history.replaceState(null, "", "/#trader");
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close/ }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(window.location.hash).toBe("");
      expect(document.body.style.overflow).toBe("");
    });

    test("closing a panel opened by a click goes Back, so no dead history step is left, and focus returns to the card", async () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      fireEvent.click(screen.getByRole("link", { name: /Jev Trader/ }));
      const back = vi.spyOn(window.history, "back");

      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close/ }));

      expect(back).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole("link", { name: /Jev Trader/ })).toHaveFocus());
      expect(document.body.style.overflow).toBe("");
    });

    test("the browser's Back button closes the panel too, and focus still returns to the card", async () => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      fireEvent.click(screen.getByRole("link", { name: /Jev Trader/ }));

      act(() => {
        window.history.replaceState(null, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole("link", { name: /Jev Trader/ })).toHaveFocus());
    });

    test("the native Escape (a close event on the dialog) closes it", async () => {
      window.history.replaceState(null, "", "/#trader");
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);

      fireEvent(screen.getByRole("dialog"), new Event("close"));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    test("clicking the dim backdrop closes it; clicking inside, or dragging a selection out to it, does not", async () => {
      window.history.replaceState(null, "", "/#trader");
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      const panel = screen.getByRole("dialog");

      fireEvent.click(within(panel).getByRole("heading", { name: "Jev Trader" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.mouseDown(within(panel).getByRole("heading", { name: "Jev Trader" }));
      fireEvent.click(panel);
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.mouseDown(panel);
      fireEvent.click(panel);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    test("shows only the sections a project has: no evidence, no recipe, no links", () => {
      render(<ProjectExplorer projects={[fsd, guard, trader]} />);

      goToHash("fsd");

      const panel = screen.getByRole("dialog");
      expect(within(panel).queryByText("The evidence")).not.toBeInTheDocument();
      expect(within(panel).queryByText("Try it")).not.toBeInTheDocument();
      expect(within(panel).queryByText("Links")).not.toBeInTheDocument();
    });

    test("offers a copy button for the install command and confirms the copy", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      goToHash("cli");

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
      render(<ProjectExplorer projects={FIXTURE_PROJECTS} />);
      goToHash("cli");

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));
      });

      expect(screen.getByRole("button", { name: "Copy install command" })).toHaveTextContent("Copy failed");
    });
  });
});
