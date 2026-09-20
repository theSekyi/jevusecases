"use client";

import { useEffect } from "react";
import { isLinkKind } from "@/lib/linkKinds";

const ENDPOINT = "/api/link-click";

/** Reports one click. Uses sendBeacon so the report survives the page being left, and never delays or blocks the click. */
function report(kind: string, project: string | undefined) {
  const body = JSON.stringify(project ? { kind, project } : { kind });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    void fetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    // Counting a click is never worth breaking one.
  }
}

/**
 * Counts clicks on anything that says what it is with data-track (and data-track-project for a project's own
 * links), through one listener on the page. Middle-clicks count too, since they open the link in a new tab.
 */
export function LinkClickTracker() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.type === "auxclick" && event.button !== 1) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-track]") : null;
      const kind = target?.dataset.track;
      if (!kind || !isLinkKind(kind)) return;
      report(kind, target?.dataset.trackProject);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  return null;
}
