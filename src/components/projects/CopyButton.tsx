"use client";

import { useEffect, useRef, useState } from "react";
import type { LinkKind } from "@/lib/linkKinds";

const RESET_MS = 1800;

/** `track` says what the button is for the click counter. */
export function CopyButton({ text, label, track }: { text: string; label: string; track?: { kind: LinkKind; project: string } }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        data-track={track?.kind}
        data-track-project={track?.project}
        className="shrink-0 rounded-md border border-bp-muted px-3 py-1.5 font-bp-mono text-xs text-bp-ink transition-colors hover:border-bp-accent hover:text-bp-accent"
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? `${label} copied` : state === "failed" ? `Could not copy ${label}` : ""}
      </span>
    </>
  );
}
