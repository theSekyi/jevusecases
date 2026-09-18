"use client";

import { useEffect, useRef, useState } from "react";
import { countryName, relativeTime, VISIBLE_EVENT_COUNT } from "@/lib/visitorEvents";

interface FeedEvent {
  id: number;
  country: string | null;
  flag: string | null;
  path: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 7000;

export function VisitorFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const latestRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const requestId = ++latestRequestId.current;
      try {
        const response = await fetch("/api/visitor-events");
        if (!response.ok) return;
        const data = (await response.json()) as { events: FeedEvent[] };
        // A slower earlier request resolving after a faster later one would otherwise
        // overwrite fresh data with stale data — only the most recently *sent* request wins.
        if (!cancelled && requestId === latestRequestId.current) setEvents(data.events);
      } catch {
        // A failed poll just means the strip doesn't update this round — nothing to show the visitor.
      }
    }

    poll();
    const pollId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickId);
  }, []);

  if (events.length === 0) return null;

  return (
    <section aria-label="Live visitor activity" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 font-bp-mono text-xs text-bp-secondary">
        <span aria-hidden="true" className="size-2 animate-[bp-pulse_2s_ease-in-out_infinite] rounded-full bg-bp-accent" />
        <span className="font-semibold text-bp-ink">Live</span>
        <span>on this site right now</span>
      </div>
      <ul className="flex flex-col gap-2 border-l border-bp-hairline pl-4 text-sm">
        {events.slice(0, VISIBLE_EVENT_COUNT).map((event, index) => (
          <li
            key={event.id}
            style={{ opacity: Math.max(0.45, 1 - index * 0.14) }}
            className="flex animate-[bp-row-in_320ms_var(--ease-out-quart)] items-baseline gap-2 text-bp-secondary"
          >
            <span aria-hidden="true">{event.flag ?? "🌐"}</span>
            <span className="min-w-0">
              Someone in <span className="text-bp-ink">{countryName(event.country)}</span> is reading{" "}
              <span className="font-bp-mono text-[13px] text-bp-ink">{event.path}</span>{" "}
              <span className="whitespace-nowrap font-bp-mono text-xs text-bp-muted">{relativeTime(event.createdAt, now)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
