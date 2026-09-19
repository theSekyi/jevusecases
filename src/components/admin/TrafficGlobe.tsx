"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoContains, geoDistance, geoOrthographic, geoPath } from "d3-geo";
import {
  centreOf,
  clampTilt,
  hasShape,
  heatByCountry,
  heatColor,
  heatGradient,
  rotationFor,
  shortestTurn,
  type HeatCountry,
} from "@/lib/globe";
import { COUNTRY_SHAPES, GRATICULE } from "@/lib/globeShapes";
import type { TrafficRow } from "@/lib/trafficStats";
import { countryCodeToFlag, countryName } from "@/lib/visitorEvents";

// Plain hex because a canvas can't read a Tailwind token. They follow the surface, hairline and ink tokens.
const SPHERE = "#0f1319";
const LAND = "#1c222a";
const BORDER = "#2b323a";
const GRID = "#1a2027";
const RIM = "#48505a";
const INK = "#eff2f5";

const MARGIN = 6;
const AUTO_ROTATE_DEGREES_PER_SECOND = 5;
const IDLE_BEFORE_ROTATING_MS = 3500;
const TURN_MS = 900;
const MARKER_HIT_PIXELS = 11;

export interface GlobeFocus {
  code: string;
  /** Changes on every request, so asking for the same country twice turns the globe twice. */
  nonce: number;
}

interface Tip {
  code: string;
  /** Where the tooltip goes, already kept inside the globe's box. */
  left: number;
  top: number;
}

const TIP_WIDTH = 176;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A globe shaded by page views. It draws only the countries the list names (see heatByCountry), so a country
 * folded into "other" has no colour, no marker and no tooltip. The drawing state lives in refs because it
 * changes every frame; React state is only the tooltip.
 */
export function TrafficGlobe({
  rows,
  highlighted,
  onHighlight,
  focus,
}: {
  rows: TrafficRow[];
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
  focus: GlobeFocus | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heat = useMemo(() => heatByCountry(rows), [rows]);
  const [tip, setTip] = useState<Tip | null>(null);

  // Everything the frame loop reads or writes lives here, so the loop never restarts.
  const live = useRef({
    heat,
    highlighted,
    onHighlight,
    lambda: 0,
    phi: -15,
    velocity: 0,
    dragging: false,
    hovering: false,
    lastInteraction: 0,
    animate: true,
    dirty: true,
    tween: null as null | { start: number; fromLambda: number; turn: number; fromPhi: number; toPhi: number },
    pendingFocus: null as GlobeFocus | null,
  });

  useEffect(() => {
    live.current.heat = heat;
    live.current.dirty = true;
  }, [heat]);
  useEffect(() => {
    live.current.highlighted = highlighted;
    live.current.dirty = true;
  }, [highlighted]);
  useEffect(() => {
    live.current.onHighlight = onHighlight;
  }, [onHighlight]);
  useEffect(() => {
    if (focus) live.current.pendingFocus = focus;
  }, [focus]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!wrap || !canvas || !context) return;

    const state = live.current;
    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, context);
    let size = 0;
    let ratio = 1;
    let raf = 0;
    let last = performance.now();
    let lastPointer = { x: 0, y: 0 };

    // Open on the busiest country, so the first thing you see is where the visits are.
    const busiest = [...state.heat.values()].sort((a, b) => b.views - a.views)[0];
    const start = busiest ? centreOf(busiest.code) : null;
    if (start) [state.lambda, state.phi] = rotationFor(start);
    state.phi = clampTilt(state.phi);

    const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const syncMotion = () => {
      state.animate = !motionQuery?.matches;
    };
    syncMotion();
    motionQuery?.addEventListener("change", syncMotion);

    function resize() {
      if (!wrap || !canvas || !context) return;
      const next = Math.round(wrap.clientWidth);
      const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (next === size && nextRatio === ratio) return;
      size = next;
      ratio = nextRatio;
      canvas.width = Math.round(size * ratio);
      canvas.height = Math.round(size * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      state.dirty = true;
    }

    function aim() {
      projection
        .translate([size / 2, size / 2])
        .scale(Math.max(1, size / 2 - MARGIN))
        .rotate([state.lambda, state.phi]);
    }

    function isFacingUs(latitude: number, longitude: number) {
      return geoDistance([longitude, latitude], [-state.lambda, -state.phi]) < Math.PI / 2 - 0.04;
    }

    function draw() {
      if (!context || size === 0) return;
      aim();
      context.clearRect(0, 0, size, size);

      context.beginPath();
      path({ type: "Sphere" });
      context.fillStyle = SPHERE;
      context.fill();

      context.beginPath();
      path(GRATICULE);
      context.strokeStyle = GRID;
      context.lineWidth = 0.6;
      context.stroke();

      context.lineWidth = 0.5;
      for (const shape of COUNTRY_SHAPES) {
        const country = shape.code ? state.heat.get(shape.code) : undefined;
        context.beginPath();
        path(shape.feature);
        context.fillStyle = country ? heatColor(country.heat) : LAND;
        context.fill();
        context.strokeStyle = BORDER;
        context.stroke();
      }

      const marked = state.highlighted && state.heat.get(state.highlighted);
      if (marked) {
        const shape = COUNTRY_SHAPES.find((candidate) => candidate.code === marked.code);
        if (shape) {
          context.beginPath();
          path(shape.feature);
          context.strokeStyle = INK;
          context.lineWidth = 1.6;
          context.stroke();
        }
      }

      // Small states and islands are too small for the map's shapes, so they get a marker at their centre.
      for (const country of state.heat.values()) {
        if (hasShape(country.code)) continue;
        const centre = centreOf(country.code);
        if (!centre || !isFacingUs(centre[0], centre[1])) continue;
        const point = projection([centre[1], centre[0]]);
        if (!point) continue;
        const isHighlighted = country.code === state.highlighted;
        context.beginPath();
        context.arc(point[0], point[1], 3.5 + country.heat * 3, 0, Math.PI * 2);
        context.fillStyle = heatColor(country.heat);
        context.fill();
        context.strokeStyle = INK;
        context.lineWidth = isHighlighted ? 1.8 : 0.9;
        context.stroke();
      }

      context.beginPath();
      path({ type: "Sphere" });
      context.strokeStyle = RIM;
      context.lineWidth = 1;
      context.stroke();
      state.dirty = false;
    }

    /** The named country under a point on the canvas, or null. Countries without data are never returned. */
    function pick(x: number, y: number): HeatCountry | null {
      aim();
      for (const country of state.heat.values()) {
        if (hasShape(country.code)) continue;
        const centre = centreOf(country.code);
        if (!centre || !isFacingUs(centre[0], centre[1])) continue;
        const point = projection([centre[1], centre[0]]);
        if (point && Math.hypot(point[0] - x, point[1] - y) <= MARKER_HIT_PIXELS) return country;
      }
      const location = projection.invert?.([x, y]);
      if (!location || Math.hypot(x - size / 2, y - size / 2) > size / 2 - MARGIN) return null;
      for (const shape of COUNTRY_SHAPES) {
        if (shape.code && state.heat.has(shape.code) && geoContains(shape.feature, location)) return state.heat.get(shape.code)!;
      }
      return null;
    }

    function startTurn(request: GlobeFocus, now: number) {
      const centre = centreOf(request.code);
      if (!centre) return;
      const [toLambda, toPhi] = rotationFor(centre);
      if (!state.animate) {
        state.lambda = toLambda;
        state.phi = clampTilt(toPhi);
        state.dirty = true;
      } else {
        state.tween = { start: now, fromLambda: state.lambda, turn: shortestTurn(state.lambda, toLambda), fromPhi: state.phi, toPhi: clampTilt(toPhi) };
      }
      state.velocity = 0;
      state.lastInteraction = now;
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last) / 1000;
      last = now;

      if (state.pendingFocus) {
        startTurn(state.pendingFocus, now);
        state.pendingFocus = null;
      }

      if (state.tween) {
        const t = Math.min(1, (now - state.tween.start) / TURN_MS);
        const eased = easeOut(t);
        state.lambda = state.tween.fromLambda + state.tween.turn * eased;
        state.phi = state.tween.fromPhi + (state.tween.toPhi - state.tween.fromPhi) * eased;
        if (t >= 1) state.tween = null;
        state.dirty = true;
      } else if (!state.dragging && Math.abs(state.velocity) > 0.02) {
        state.lambda += state.velocity;
        state.velocity *= 0.94;
        state.dirty = true;
      } else if (state.animate && !state.dragging && !state.hovering && now - state.lastInteraction > IDLE_BEFORE_ROTATING_MS) {
        state.lambda += AUTO_ROTATE_DEGREES_PER_SECOND * dt;
        state.dirty = true;
      }

      if (state.dirty) draw();
    }

    function local(event: PointerEvent) {
      const box = canvas!.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function onDown(event: PointerEvent) {
      state.dragging = true;
      state.tween = null;
      state.velocity = 0;
      state.lastInteraction = performance.now();
      lastPointer = local(event);
      canvas!.setPointerCapture(event.pointerId);
      canvas!.style.cursor = "grabbing";
    }

    function onMove(event: PointerEvent) {
      const point = local(event);
      state.lastInteraction = performance.now();
      if (state.dragging) {
        const degreesPerPixel = 75 / Math.max(1, size / 2);
        const dx = (point.x - lastPointer.x) * degreesPerPixel;
        state.lambda += dx;
        state.velocity = dx;
        state.phi = clampTilt(state.phi - (point.y - lastPointer.y) * degreesPerPixel);
        lastPointer = point;
        state.dirty = true;
        setTip(null);
        return;
      }
      state.hovering = true;
      const country = pick(point.x, point.y);
      canvas!.style.cursor = country ? "pointer" : "grab";
      state.onHighlight(country?.code ?? null);
      setTip(
        country
          ? { code: country.code, left: Math.max(4, Math.min(point.x + 14, size - TIP_WIDTH - 4)), top: Math.max(4, point.y - 8) }
          : null,
      );
    }

    function onUp(event: PointerEvent) {
      state.dragging = false;
      state.lastInteraction = performance.now();
      if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
      canvas!.style.cursor = "grab";
    }

    function onLeave() {
      state.hovering = false;
      state.onHighlight(null);
      setTip(null);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      motionQuery?.removeEventListener("change", syncMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
    // The frame loop reads everything that changes through the live ref, so it is set up once.
  }, []);

  const named = [...heat.values()].sort((a, b) => b.views - a.views);
  const busiest = named[0];
  const tipCountry = tip ? heat.get(tip.code) : null;
  const label = busiest
    ? `Globe shaded by page views. Busiest: ${countryName(busiest.code)}, ${busiest.views.toLocaleString("en-US")}. The list has every number.`
    : "Globe shaded by page views. No countries to show yet.";

  return (
    <figure className="flex flex-col gap-4">
      <div ref={wrapRef} className="relative mx-auto aspect-square w-full max-w-[34rem] select-none">
        <canvas ref={canvasRef} role="img" aria-label={label} className="size-full cursor-grab touch-pan-y" />
        {tip && tipCountry && (
          <div
            aria-hidden="true"
            style={{ left: tip.left, top: tip.top, width: TIP_WIDTH }}
            className="pointer-events-none absolute z-10 rounded-lg border border-bp-muted bg-bp-surface px-3 py-2 text-sm shadow-lg"
          >
            <div className="flex items-center gap-2 font-semibold">
              <span>{countryCodeToFlag(tipCountry.code)}</span>
              <span>{countryName(tipCountry.code)}</span>
            </div>
            <div className="font-bp-mono text-xs text-bp-secondary">
              {tipCountry.views.toLocaleString("en-US")} views · {tipCountry.visitors.toLocaleString("en-US")} visitors
            </div>
          </div>
        )}
      </div>

      <figcaption className="mx-auto flex w-full max-w-[34rem] flex-col gap-2">
        <div aria-hidden="true" className="h-2 rounded-full" style={{ background: heatGradient() }} />
        <div className="flex justify-between font-bp-mono text-[11px] text-bp-secondary">
          <span>Fewer page views</span>
          <span>{busiest ? `Most: ${busiest.views.toLocaleString("en-US")}` : "No data yet"}</span>
        </div>
        <p className="text-xs text-bp-secondary">
          Drag to turn the globe. Colour follows the square root of page views. Countries with too few visits are folded
          into &ldquo;Other&rdquo; in the list and left uncoloured here.
        </p>
      </figcaption>
    </figure>
  );
}
