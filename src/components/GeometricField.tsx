"use client";

import { useEffect, useRef } from "react";
import {
  ACCENT_THRESHOLD,
  buildLattice,
  createFrameState,
  marginFade,
  spacingFor,
  updateFrame,
  type FrameState,
  type Lattice,
} from "@/lib/fieldGeometry";

// The accent is the --color-bp-accent token. The two greys are mid-tones picked for the canvas, lighter than
// the hairline and muted tokens because thin lines over a near-black page need it to read at all.
const LINE = "#5a616a";
const DOT = "#8a919a";
const ACCENT = "#fe843d";

const LINE_ALPHA = 0.46;
const DOT_ALPHA = 0.7;
const DOT_RADIUS = 1.3;
const ACCENT_LINE_ALPHA = 0.7;
const ACCENT_DOT_GROWTH = 1.8;
/** Under the content column the accent is dimmed too, so a highlight passing behind text doesn't cost it contrast. */
const ACCENT_FLOOR = 0.35;

const IDLE_MS = 1600;
/** A little under 1000/30, so two 60 Hz frames (33.3 ms apart, give or take) are never skipped by timer jitter. */
const FRAME_MS = 1000 / 30 - 2;
/** Matches the max-w-6xl column the header, hero and explorer use. */
const CONTENT_WIDTH = 1152;

/**
 * A slowly drifting triangular lattice behind the page. Lines and dots near the cursor (or the last touch)
 * pick up the accent colour. It only draws: the geometry and lighting live in fieldGeometry, and it never
 * takes pointer events, so clicks, selection and scrolling are unaffected.
 */
export function GeometricField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let animate = !motionQuery?.matches;

    let width = 0;
    let height = 0;
    let ratio = 1;
    let lattice: Lattice | null = null;
    let frame: FrameState | null = null;
    let accentFade: Float32Array | null = null;
    let raf = 0;
    let lastDraw = 0;
    let pointer = { x: -9999, y: -9999, seen: 0 };
    let smoothed = { x: -9999, y: -9999, strength: 0 };

    function resize() {
      if (!canvas || !context) return;
      // clientWidth excludes a classic scrollbar, so the canvas and its lattice match the box they fill.
      const nextWidth = document.documentElement.clientWidth || window.innerWidth;
      const nextHeight = document.documentElement.clientHeight || window.innerHeight;
      const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
      // Mobile browsers fire resize as the address bar slides away; nothing needs rebuilding if the size is the same.
      if (lattice && nextWidth === width && nextHeight === height && nextRatio === ratio) return;

      width = nextWidth;
      height = nextHeight;
      ratio = nextRatio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      lattice = buildLattice(width, height, spacingFor(width));
      frame = createFrameState(lattice, width, CONTENT_WIDTH);
      accentFade = frame.fade.map((_, i) => marginFade(lattice!.points[i * 2], width, CONTENT_WIDTH, ACCENT_FLOOR));
      draw(performance.now());
    }

    function draw(now: number) {
      if (!context || !lattice || !frame || !accentFade) return;
      const { edges } = lattice;
      const { xs, ys, lit, fade } = frame;

      updateFrame(frame, lattice, {
        seconds: now / 1000,
        scrollY: window.scrollY,
        width,
        height,
        animate,
        pointer: smoothed,
      });

      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;

      context.strokeStyle = LINE;
      for (let e = 0; e < edges.length; e += 2) {
        const a = edges[e];
        const b = edges[e + 1];
        context.globalAlpha = LINE_ALPHA * ((fade[a] + fade[b]) / 2);
        context.beginPath();
        context.moveTo(xs[a], ys[a]);
        context.lineTo(xs[b], ys[b]);
        context.stroke();
      }

      if (animate) {
        context.strokeStyle = ACCENT;
        for (let e = 0; e < edges.length; e += 2) {
          const a = edges[e];
          const b = edges[e + 1];
          const strength = (lit[a] + lit[b]) / 2;
          if (strength < ACCENT_THRESHOLD) continue;
          context.globalAlpha = strength * ACCENT_LINE_ALPHA * ((accentFade[a] + accentFade[b]) / 2);
          context.beginPath();
          context.moveTo(xs[a], ys[a]);
          context.lineTo(xs[b], ys[b]);
          context.stroke();
        }
      }

      const count = xs.length;
      context.fillStyle = DOT;
      for (let i = 0; i < count; i++) {
        context.globalAlpha = DOT_ALPHA * fade[i];
        context.beginPath();
        context.arc(xs[i], ys[i], DOT_RADIUS, 0, Math.PI * 2);
        context.fill();
      }
      if (animate) {
        context.fillStyle = ACCENT;
        for (let i = 0; i < count; i++) {
          if (lit[i] < ACCENT_THRESHOLD) continue;
          context.globalAlpha = lit[i] * accentFade[i];
          context.beginPath();
          context.arc(xs[i], ys[i], DOT_RADIUS + lit[i] * ACCENT_DOT_GROWTH, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;

      const idle = now - pointer.seen > IDLE_MS;
      smoothed.strength += ((idle ? 0 : 1) - smoothed.strength) * 0.12;
      smoothed.x += (pointer.x - smoothed.x) * 0.22;
      smoothed.y += (pointer.y - smoothed.y) * 0.22;
      draw(now);
    }

    function onPointer(event: PointerEvent) {
      // A press or a touch lands where it lands; a highlight still fading from somewhere else shouldn't slide over.
      if (event.type === "pointerdown" || smoothed.strength < 0.01) {
        smoothed = { x: event.clientX, y: event.clientY, strength: smoothed.strength };
      }
      pointer = { x: event.clientX, y: event.clientY, seen: performance.now() };
    }

    function run() {
      animate = !motionQuery?.matches;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      smoothed = { x: -9999, y: -9999, strength: 0 };

      if (animate) {
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("pointerdown", onPointer, { passive: true });
        raf = requestAnimationFrame(tick);
      }
      draw(performance.now());
    }

    resize();
    run();
    window.addEventListener("resize", resize);
    // Someone can switch Reduce Motion on or off while the page is open.
    motionQuery?.addEventListener("change", run);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      motionQuery?.removeEventListener("change", run);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
