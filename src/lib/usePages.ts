import { useState } from "react";

/** Divides evenly into the grid's one, two and three columns, so every full page ends on a full row. */
export const PAGE_SIZE = 48;

/**
 * The first pages of `items`, one more per `showMore()`. A new `view` (another search, filter or sort) starts
 * again at one page. The page always reaches `reveal`, so a card opened by a link is there to return focus to.
 */
export function usePages<T>(items: T[], view: string, reveal?: T | null) {
  const [shown, setShown] = useState({ view, count: PAGE_SIZE });
  const count = shown.view === view ? shown.count : PAGE_SIZE;
  const needed = Math.ceil((items.indexOf(reveal as T) + 1) / PAGE_SIZE) * PAGE_SIZE;
  if (shown.view !== view || needed > count) setShown({ view, count: Math.max(count, needed) });

  return {
    page: items.slice(0, count),
    more: Math.min(PAGE_SIZE, Math.max(0, items.length - count)),
    showMore: () => setShown({ view, count: count + PAGE_SIZE }),
  };
}
