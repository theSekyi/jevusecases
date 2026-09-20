import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LinkClickTracker } from "../LinkClickTracker";

const sendBeacon = vi.fn();

async function sent(index = 0): Promise<unknown> {
  const blob = sendBeacon.mock.calls[index][1] as Blob;
  return JSON.parse(await blob.text());
}

function page() {
  return render(
    <>
      <LinkClickTracker />
      <a href="#guard" data-track="project_open" data-track-project="guard">
        <span>Open <b>guard</b></span>
      </a>
      <a href="https://github.com/acme/tool" data-track="source" data-track-project="guard" onClick={(e) => e.preventDefault()}>
        Source
      </a>
      <button type="button" data-track="copy_install" data-track-project="guard">Copy</button>
      <a href="/submit" data-track="submit" onClick={(e) => e.preventDefault()}>Submit</a>
      <a href="/privacy" onClick={(e) => e.preventDefault()}>Privacy</a>
      <a href="/x" data-track="not_a_kind" onClick={(e) => e.preventDefault()}>Odd</a>
      <button type="button">Plain</button>
    </>,
  );
}

describe("LinkClickTracker", () => {
  beforeEach(() => {
    sendBeacon.mockReset();
    sendBeacon.mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("reports a click on a link with its kind and project, as JSON", async () => {
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/link-click");
    expect((sendBeacon.mock.calls[0][1] as Blob).type).toBe("application/json");
    expect(await sent()).toEqual({ kind: "source", project: "guard" });
  });

  test("reports a button, and a site-wide link with no project", async () => {
    page();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("link", { name: "Submit" }));

    expect(await sent(0)).toEqual({ kind: "copy_install", project: "guard" });
    expect(await sent(1)).toEqual({ kind: "submit" });
  });

  test("finds the labelled link when the click lands on something inside it", async () => {
    page();

    fireEvent.click(screen.getByText("guard"));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(await sent()).toEqual({ kind: "project_open", project: "guard" });
  });

  test("still reports when something else on the page stops the click from bubbling", async () => {
    render(
      <>
        <LinkClickTracker />
        <div onClick={(e) => e.stopPropagation()}>
          <a href="/submit" data-track="submit" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>Submit</a>
        </div>
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Submit" }));

    expect(await sent()).toEqual({ kind: "submit" });
  });

  test("counts a middle-click, which opens the link in a new tab, but not a right-click", async () => {
    page();
    const link = screen.getByRole("link", { name: "Source" });

    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 2 }));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  test("counts a Ctrl-click, which is a click", () => {
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }), { ctrlKey: true });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  test("ignores links and buttons that don't say what they are, and kinds it doesn't know", () => {
    page();

    fireEvent.click(screen.getByRole("link", { name: "Privacy" }));
    fireEvent.click(screen.getByRole("button", { name: "Plain" }));
    fireEvent.click(screen.getByRole("link", { name: "Odd" }));
    fireEvent.click(document.body);

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  test("falls back to fetch with keepalive when the beacon is refused", async () => {
    sendBeacon.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/link-click",
      expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify({ kind: "source", project: "guard" }) }),
    );
    vi.unstubAllGlobals();
  });

  test("never breaks the click when reporting throws", () => {
    sendBeacon.mockImplementation(() => {
      throw new Error("blocked");
    });
    const uncaught = vi.fn();
    window.addEventListener("error", uncaught);
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }));

    window.removeEventListener("error", uncaught);
    expect(sendBeacon).toHaveBeenCalled();
    expect(uncaught).not.toHaveBeenCalled();
  });

  test("never breaks the click when the fetch fallback is refused", async () => {
    sendBeacon.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    window.removeEventListener("unhandledrejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test("uses fetch when the browser has no sendBeacon at all", () => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true, writable: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  test("leaves the click alone: it does not stop a link from being followed or a click from reaching other handlers", () => {
    const elsewhere = vi.fn();
    render(
      <div onClick={elsewhere}>
        <LinkClickTracker />
        <a href="#somewhere" data-track="submit">Go</a>
      </div>,
    );

    const notPrevented = fireEvent.click(screen.getByRole("link", { name: "Go" }));

    expect(notPrevented).toBe(true);
    expect(elsewhere).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  test("does not report the same click twice after it is unmounted and mounted again", () => {
    const { unmount } = page();
    unmount();
    page();

    fireEvent.click(screen.getByRole("link", { name: "Source" }));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
