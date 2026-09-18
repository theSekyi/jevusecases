import type { MouseEvent } from "react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function readHash(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

/** The id in the URL hash ("/#jev-guard"), or "". The hash is what makes an open project shareable. */
export function useProjectHash(): string {
  return useSyncExternalStore(subscribe, readHash, () => "");
}

const STATE_KEY = "projectPanel";

/** pushState doesn't fire hashchange, and the panel listens for it. */
function announceHashChange() {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/**
 * Opens a project the way a modal route should: one new history entry, so Back closes the panel.
 * Left alone for modified clicks (new tab, new window), which should follow the link as usual.
 */
export function openProjectOnClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  window.history.pushState({ [STATE_KEY]: true }, "", `#${id}`);
  announceHashChange();
}

/**
 * Closes the panel. If the panel was opened by a click here, that click's history entry is undone with
 * Back, so closing leaves no dead step behind. A page opened straight on a shared link has nothing to
 * go back to, so the hash is just cleared.
 */
export function closeProject() {
  if (window.history.state?.[STATE_KEY]) {
    window.history.back();
    return;
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  announceHashChange();
}
