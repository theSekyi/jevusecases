import data from "@/data/globe-countries.json";
import type { TrafficRow } from "@/lib/trafficStats";

const SHAPE_CODES = data.numeric as Record<string, string>;
const SHAPE_NAMES = data.names as Record<string, string>;
const CENTRES = data.centres as unknown as Record<string, [number, number]>;
const CODES_WITH_SHAPES = new Set([...Object.values(SHAPE_CODES), ...Object.values(SHAPE_NAMES)]);

/** The colours the globe is drawn in. Mid-dark tones picked for the canvas; only the ink matches a site token. */
export const GLOBE_COLORS = {
  sphere: "#0f1319",
  land: "#1c222a",
  border: "#2b323a",
  grid: "#1a2027",
  rim: "#48505a",
  ink: "#eff2f5",
} as const;

/** The two-letter code for a country shape on the map, or null for a shape with no country behind it. */
export function codeForShape(id: string | undefined, name: string | undefined): string | null {
  if (id !== undefined && SHAPE_CODES[id]) return SHAPE_CODES[id];
  return (name && SHAPE_NAMES[name]) || null;
}

/** [latitude, longitude] of a country's centre, or null when the code is unknown. */
export function centreOf(code: string): [number, number] | null {
  return CENTRES[code.toUpperCase()] ?? null;
}

/** True when the map has a shape to colour for this country. Small states and islands have only a centre point. */
export function hasShape(code: string): boolean {
  return CODES_WITH_SHAPES.has(code.toUpperCase());
}

export interface HeatCountry {
  code: string;
  views: number;
  visitors: number;
  /** 0 to 1, where the busiest country is 1. */
  heat: number;
}

/** The dimmest colour any country with data gets, so a small country is still visible next to a busy one. */
export const HEAT_FLOOR = 0.18;

/** Square-root scale from views to 0..1, lifted off zero. Square root keeps a huge country from washing out the rest. */
export function heatFraction(views: number, maxViews: number): number {
  if (maxViews <= 0 || views <= 0) return 0;
  return HEAT_FLOOR + (1 - HEAT_FLOOR) * Math.sqrt(Math.min(1, views / maxViews));
}

/**
 * The countries to colour: only the ones the list names. Countries folded into "other" or "unknown" carry no
 * code at all, so nothing about them can reach the globe.
 */
export function heatByCountry(rows: TrafficRow[]): Map<string, HeatCountry> {
  const named = rows.flatMap((row) => (row.kind === "country" ? [row] : []));
  const maxViews = Math.max(0, ...named.map((row) => row.views));
  return new Map(
    named.map((row) => [
      row.country,
      { code: row.country, views: row.views, visitors: row.visitors, heat: heatFraction(row.views, maxViews) },
    ]),
  );
}

/** Dim ember to the site's orange to a hot peach. Stops are [position, r, g, b]. */
const RAMP: [number, number, number, number][] = [
  [0, 0x5a, 0x33, 0x24],
  [0.4, 0xa2, 0x48, 0x1f],
  [0.72, 0xfe, 0x84, 0x3d],
  [1, 0xff, 0xc9, 0x9a],
];

/** The colour for a heat value from 0 to 1, as #rrggbb. Values outside the range are clamped. */
export function heatColor(heat: number): string {
  const t = Math.min(1, Math.max(0, heat));
  const upper = RAMP.findIndex(([position]) => position >= t);
  const [p1, r1, g1, b1] = RAMP[Math.max(0, upper - 1)];
  const [p2, r2, g2, b2] = RAMP[Math.max(1, upper)] ?? RAMP[RAMP.length - 1];
  const local = p2 === p1 ? 0 : (t - p1) / (p2 - p1);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * local).toString(16).padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

/** CSS for the legend bar: the same ramp the globe uses. */
export function heatGradient(): string {
  const stops = RAMP.map(([position]) => `${heatColor(position)} ${Math.round(position * 100)}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** The globe rotation, [longitude, latitude], that puts a point at the middle of the view. */
export function rotationFor([latitude, longitude]: [number, number]): [number, number] {
  return [-longitude, -latitude];
}

/** The shortest signed turn from one longitude to another, in degrees, so the globe never spins the long way. */
export function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** Latitude is kept off the poles, where the map flips over. */
export const MAX_TILT = 75;
export function clampTilt(latitude: number): number {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, latitude));
}

/** The named country with the most views. Ties go to the code that sorts first, so the choice never flickers. */
export function busiestCountry(heat: Map<string, HeatCountry>): HeatCountry | null {
  let best: HeatCountry | null = null;
  for (const country of heat.values()) {
    if (!best || country.views > best.views || (country.views === best.views && country.code < best.code)) best = country;
  }
  return best;
}

export interface MarkerCountry {
  country: HeatCountry;
  /** [latitude, longitude] */
  centre: [number, number];
}

/** Named countries too small for a shape, which the globe marks with a dot at their centre instead. */
export function markerCountries(heat: Map<string, HeatCountry>): MarkerCountry[] {
  return [...heat.values()].flatMap((country) => {
    const centre = hasShape(country.code) ? null : centreOf(country.code);
    return centre ? [{ country, centre }] : [];
  });
}

const MARKER_BASE_RADIUS = 3.5;
const MARKER_HEAT_RADIUS = 3;

/** A marker's radius in pixels: bigger for a busier country. */
export function markerRadius(heat: number): number {
  return MARKER_BASE_RADIUS + heat * MARKER_HEAT_RADIUS;
}

/** Where the tooltip goes for a pointer at (x, y) on a square canvas: beside the pointer, kept inside the canvas. */
export function tooltipPosition(x: number, y: number, size: number, width: number, height: number): { left: number; top: number } {
  const edge = 4;
  return {
    left: Math.max(edge, Math.min(x + 14, size - width - edge)),
    top: Math.max(edge, Math.min(y - 8, size - height - edge)),
  };
}
