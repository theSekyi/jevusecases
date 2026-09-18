import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
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

/** Clears the hash without adding a history entry or scrolling. */
export function clearProjectHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
