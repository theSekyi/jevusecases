"use client";

import { useEffect, useState } from "react";

interface FeedEvent {
  id: number;
  country: string | null;
  flag: string | null;
  path: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 7000;
const MAX_VISIBLE = 5;

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string | null): string {
  if (!code) return "Somewhere";
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function VisitorFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/visitor-events");
        if (!response.ok) return;
        const data = (await response.json()) as { events: FeedEvent[] };
        if (!cancelled) setEvents(data.events);
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
    <section className="border-b border-bp-hairline bg-bp-bg px-6 py-4 font-bp-mono text-[12px]">
      <div className="mx-auto flex max-w-5xl flex-col gap-1.5">
        {events.slice(0, MAX_VISIBLE).map((event) => (
          <div
            key={event.id}
            className="flex animate-[bp-card-in_220ms_ease-out] items-baseline gap-2 text-bp-secondary"
          >
            <span aria-hidden="true">{event.flag ?? "🌐"}</span>
            <span>
              Someone in <span className="text-bp-ink">{countryName(event.country)}</span> is reading{" "}
              <span className="text-bp-ink">{event.path}</span>
            </span>
            <span className="text-bp-secondary/70">{relativeTime(event.createdAt, now)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
