import { useState } from "react";

/** Divides evenly into the grid's one, two, three and four columns, so every full page ends on a full row. */
export const PAGE_SIZE = 48;

/**
 * The first pages of `items`, one more page per `showMore()`. A new `view` (another search, filter or sort)
 * starts again at one page, so nobody lands deep in a list they didn't ask for.
 */
export function usePages<T>(items: T[], view: string) {
  const [shown, setShown] = useState({ view, count: PAGE_SIZE });
  const count = shown.view === view ? shown.count : PAGE_SIZE;

  return {
    page: items.slice(0, count),
    remaining: Math.max(0, items.length - count),
    showMore: () => setShown({ view, count: count + PAGE_SIZE }),
  };
}
