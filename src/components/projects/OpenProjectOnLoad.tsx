"use client";

import { useEffect } from "react";

/**
 * Moves a /p/<id> visit onto the homepage's own "/#<id>" address, which opens the panel. It replaces the
 * history entry instead of adding one, so closing the panel leaves the visitor on the gallery. The query
 * string (a ?ref= tag) is kept.
 */
export function OpenProjectOnLoad({ id }: { id: string }) {
  useEffect(() => {
    window.history.replaceState(null, "", `/${window.location.search}#${encodeURIComponent(id)}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [id]);
  return null;
}
