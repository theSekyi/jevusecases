// Display helpers with no database import, so browser components can use them without pulling the driver into their bundle.

export interface VisitorEvent {
  id: number;
  country: string | null;
  path: string;
  createdAt: string;
}

/** How long an event stays visible in the live strip. Storage itself is unaffected — rows are kept for a later aggregation view. */
export const LIVE_WINDOW_MS = 3 * 60 * 1000;

/** How many recent events the live strip actually shows — callers should ask for exactly this many, not more. */
export const VISIBLE_EVENT_COUNT = 5;

const EMOJI_FLAG_OFFSET = 127397;
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

/** True for a plausible ISO 3166-1 alpha-2 code — a cheap shape check, not a lookup against the real list. */
export function isValidCountryCode(countryCode: string | null | undefined): countryCode is string {
  return typeof countryCode === "string" && COUNTRY_CODE_PATTERN.test(countryCode);
}

/** Turns an ISO 3166-1 alpha-2 country code into its flag emoji, e.g. "US" -> "🇺🇸". */
export function countryCodeToFlag(countryCode: string | null): string | null {
  if (!isValidCountryCode(countryCode)) return null;
  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => EMOJI_FLAG_OFFSET + char.charCodeAt(0),
  );
  return String.fromCodePoint(...codePoints);
}

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });

/** A human-readable country name for display, falling back to a generic label when there's no real geolocation (e.g. local dev). */
export function countryName(countryCode: string | null): string {
  if (!isValidCountryCode(countryCode)) return "Somewhere";
  try {
    return countryDisplayNames.of(countryCode.toUpperCase()) ?? countryCode;
  } catch {
    return countryCode;
  }
}

/** A short "Ns ago" / "Nm ago" label for how long ago an ISO timestamp was, relative to `now`. */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/** The one window this page reports, fixed on purpose. */
export const TRAFFIC_WINDOW_DAYS = 7;

/** A row's share of the total as a short label: one decimal below 10%, whole numbers above, "<0.1%" for slivers. */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return "0%";
  const share = (part / total) * 100;
  if (share < 0.1) return "<0.1%";
  const oneDecimal = Number(share.toFixed(1));
  return oneDecimal < 10 ? `${oneDecimal.toFixed(1)}%` : `${Math.round(share)}%`;
}
