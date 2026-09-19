import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PAGE_SIZE, usePages } from "../usePages";

const items = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => i);

describe("usePages", () => {
  test("starts with one page and says how many are left", () => {
    const { result } = renderHook(() => usePages(items, "all"));
    expect(result.current.page).toEqual(items.slice(0, PAGE_SIZE));
    expect(result.current.remaining).toBe(PAGE_SIZE + 5);
  });

  test("each showMore adds a page, and the last one is short", () => {
    const { result } = renderHook(() => usePages(items, "all"));
    act(() => result.current.showMore());
    expect(result.current.page).toHaveLength(PAGE_SIZE * 2);
    act(() => result.current.showMore());
    expect(result.current.page).toEqual(items);
    expect(result.current.remaining).toBe(0);
  });

  test("a new view starts again at one page", () => {
    const { result, rerender } = renderHook(({ view }) => usePages(items, view), { initialProps: { view: "all" } });
    act(() => result.current.showMore());
    rerender({ view: "searched" });
    expect(result.current.page).toHaveLength(PAGE_SIZE);
  });

  test("a list shorter than a page has nothing left", () => {
    const { result } = renderHook(() => usePages([1, 2, 3], "all"));
    expect(result.current.page).toEqual([1, 2, 3]);
    expect(result.current.remaining).toBe(0);
  });
});
