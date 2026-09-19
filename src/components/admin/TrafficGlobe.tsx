"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoContains, geoDistance, geoOrthographic, geoPath } from "d3-geo";
import {
  GLOBE_COLORS,
  busiestCountry,
  centreOf,
  heatByCountry,
  heatColor,
  heatGradient,
  markerCountries,
  markerRadius,
  tooltipPosition,
  type HeatCountry,
} from "@/lib/globe";
import { beginTurn, createMotion, dragBy, endDrag, startDrag, stepMotion, type MotionState } from "@/lib/globeMotion";
import { COUNTRY_SHAPES, GRATICULE, SHAPE_BY_CODE } from "@/lib/globeShapes";
import type { TrafficRow } from "@/lib/trafficStats";
import { countryCodeToFlag, countryName } from "@/lib/visitorEvents";

const MARGIN = 6;
const MAX_STEP_MS = 64;
const MARKER_HIT_PIXELS = 11;
/** A dot this close to the edge of the disc is on the far side, seen edge-on, so it isn't drawn or hit. */
const FACING_MARGIN = 0.04;
/** Degrees the globe turns per pixel of drag, per pixel of radius: dragging across the disc turns it about this much. */
const DRAG_DEGREES_ACROSS_RADIUS = 75;
const TIP_WIDTH = 176;
const TIP_HEIGHT = 56;

const SHAPE_LINE = 0.5;
const GRID_LINE = 0.6;
const RIM_LINE = 1;
const OUTLINE_LINE = 1.6;
const MARKER_LINE = 0.9;
const MARKER_HIGHLIGHT_LINE = 1.8;

export interface GlobeFocus {
  /** Turn to face this country. A new object is a new request, so asking for the same country again turns again. */
  code: string;
}

interface Tip {
  code: string;
  left: number;
  top: number;
}

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
  const busiest = useMemo(() => busiestCountry(heat), [heat]);
  const [tip, setTip] = useState<Tip | null>(null);

  // What the frame loop reads and writes. It lives in a ref so the loop is set up once and never restarts.
  const live = useRef({
    heat,
    markers: markerCountries(heat),
    highlighted,
    onHighlight,
    dirty: true,
    pendingFocus: null as GlobeFocus | null,
    motion: null as MotionState | null,
  });

  useEffect(() => {
    live.current.heat = heat;
    live.current.markers = markerCountries(heat);
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
    let activePointer: number | null = null;
    let lastPointer = { x: 0, y: 0 };

    const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    // Open on the busiest country, so the first thing you see is where the visits are.
    const start = busiestCountry(state.heat);
    const motion = createMotion(start ? centreOf(start.code) : null, last, !motionQuery?.matches);
    state.motion = motion;
    const syncMotion = () => {
      motion.animate = !motionQuery?.matches;
      if (!motion.animate) motion.velocity = 0;
    };
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
        .rotate([motion.lambda, motion.phi]);
    }

    function isFacingUs([latitude, longitude]: [number, number]) {
      return geoDistance([longitude, latitude], [-motion.lambda, -motion.phi]) < Math.PI / 2 - FACING_MARGIN;
    }

    function traceSphere(stroke: string, width: number) {
      context!.beginPath();
      path({ type: "Sphere" });
      context!.strokeStyle = stroke;
      context!.lineWidth = width;
      context!.stroke();
    }

    function draw() {
      if (!context || size === 0) return;
      aim();
      context.clearRect(0, 0, size, size);

      context.beginPath();
      path({ type: "Sphere" });
      context.fillStyle = GLOBE_COLORS.sphere;
      context.fill();

      context.beginPath();
      path(GRATICULE);
      context.strokeStyle = GLOBE_COLORS.grid;
      context.lineWidth = GRID_LINE;
      context.stroke();

      for (const shape of COUNTRY_SHAPES) {
        const country = shape.code ? state.heat.get(shape.code) : undefined;
        context.beginPath();
        path(shape.feature);
        context.fillStyle = country ? heatColor(country.heat) : GLOBE_COLORS.land;
        context.fill();
        context.strokeStyle = GLOBE_COLORS.border;
        context.lineWidth = SHAPE_LINE;
        context.stroke();
      }

      const outlined = state.highlighted && state.heat.has(state.highlighted) ? SHAPE_BY_CODE.get(state.highlighted) : undefined;
      if (outlined) {
        context.beginPath();
        path(outlined.feature);
        context.strokeStyle = GLOBE_COLORS.ink;
        context.lineWidth = OUTLINE_LINE;
        context.stroke();
      }

      for (const { country, centre } of state.markers) {
        if (!isFacingUs(centre)) continue;
        const point = projection([centre[1], centre[0]]);
        if (!point) continue;
        context.beginPath();
        context.arc(point[0], point[1], markerRadius(country.heat), 0, Math.PI * 2);
        context.fillStyle = heatColor(country.heat);
        context.fill();
        context.strokeStyle = GLOBE_COLORS.ink;
        context.lineWidth = country.code === state.highlighted ? MARKER_HIGHLIGHT_LINE : MARKER_LINE;
        context.stroke();
      }

      traceSphere(GLOBE_COLORS.rim, RIM_LINE);
      state.dirty = false;
    }

    /** The named country under a point on the canvas, or null. Countries without data are never returned. */
    function pick(x: number, y: number): HeatCountry | null {
      aim();
      for (const { country, centre } of state.markers) {
        if (!isFacingUs(centre)) continue;
        const point = projection([centre[1], centre[0]]);
        if (point && Math.hypot(point[0] - x, point[1] - y) <= MARKER_HIT_PIXELS) return country;
      }
      if (Math.hypot(x - size / 2, y - size / 2) > size / 2 - MARGIN) return null;
      const location = projection.invert?.([x, y]);
      if (!location) return null;
      for (const country of state.heat.values()) {
        const shape = SHAPE_BY_CODE.get(country.code);
        if (shape && geoContains(shape.feature, location)) return country;
      }
      return null;
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(MAX_STEP_MS, now - last) / 1000;
      last = now;

      if (state.pendingFocus) {
        const centre = centreOf(state.pendingFocus.code);
        if (centre) {
          beginTurn(motion, centre, now);
          state.dirty = true;
        }
        state.pendingFocus = null;
      }
      if (stepMotion(motion, now, dt)) state.dirty = true;
      if (state.dirty) draw();
    }

    function local(event: PointerEvent) {
      const box = canvas!.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function onDown(event: PointerEvent) {
      // One finger or the left button turns the globe. A second finger, or a right click, is not part of the drag.
      if (activePointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      activePointer = event.pointerId;
      startDrag(motion, performance.now());
      lastPointer = local(event);
      canvas!.setPointerCapture(event.pointerId);
      canvas!.style.cursor = "grabbing";
      // The country under the cursor is about to move away from it, so let go of its highlight.
      state.onHighlight(null);
      setTip(null);
    }

    function onMove(event: PointerEvent) {
      const point = local(event);
      if (motion.dragging) {
        if (event.pointerId !== activePointer) return;
        const degreesPerPixel = DRAG_DEGREES_ACROSS_RADIUS / Math.max(1, size / 2);
        dragBy(motion, (point.x - lastPointer.x) * degreesPerPixel, (point.y - lastPointer.y) * degreesPerPixel, performance.now());
        lastPointer = point;
        state.dirty = true;
        return;
      }
      motion.lastInteraction = performance.now();
      motion.hovering = true;
      const country = pick(point.x, point.y);
      canvas!.style.cursor = country ? "pointer" : "grab";
      state.onHighlight(country?.code ?? null);
      setTip(country ? { code: country.code, ...tooltipPosition(point.x, point.y, size, TIP_WIDTH, TIP_HEIGHT) } : null);
    }

    function onUp(event: PointerEvent) {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      endDrag(motion, performance.now());
      if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
      canvas!.style.cursor = "grab";
    }

    function onLeave() {
      motion.hovering = false;
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
