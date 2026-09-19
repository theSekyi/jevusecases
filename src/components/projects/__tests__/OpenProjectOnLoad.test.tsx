import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { OpenProjectOnLoad } from "../OpenProjectOnLoad";

describe("OpenProjectOnLoad", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  test("moves /p/<id> to /#<id> in place, keeping the ref tag, and tells the panel", () => {
    window.history.pushState(null, "", "/p/jev-guard?ref=x-post");
    const length = window.history.length;
    const onHash = vi.fn();
    window.addEventListener("hashchange", onHash);

    render(<OpenProjectOnLoad id="jev-guard" />);

    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/?ref=x-post#jev-guard");
    expect(window.history.length).toBe(length);
    expect(onHash).toHaveBeenCalled();
    window.removeEventListener("hashchange", onHash);
  });
});
