"use client";

import { useEffect, useRef } from "react";
import {
  buildLattice,
  drift,
  marginFade,
  proximity,
  scrollShift,
  spacingFor,
  sweepIntensity,
  type Lattice,
} from "@/lib/fieldGeometry";

// Same colours as the tokens in globals.css, as plain hex because a canvas can't read a Tailwind token.
const LINE = "#5a616a";
const DOT = "#8a919a";
const ACCENT = "#fe843d";

const POINTER_RADIUS = 190;
const IDLE_MS = 1600;
const FRAME_MS = 1000 / 30;
const CONTENT_WIDTH = 1152;

/**
 * A slowly drifting triangular lattice behind the page. Lines and dots near the cursor (or the last touch)
 * pick up the accent colour. It only draws: the geometry lives in fieldGeometry, and it never takes pointer
 * events, so clicks, selection and scrolling are unaffected.
 */
export function GeometricField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let lattice: Lattice | null = null;
    let frame = 0;
    let lastDraw = 0;
    let pointer = { x: -9999, y: -9999, seen: 0 };
    let smoothed = { x: -9999, y: -9999, strength: 0 };

    function resize() {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      lattice = buildLattice(width, height, spacingFor(width));
      draw(performance.now());
    }

    function draw(now: number) {
      if (!context || !lattice) return;
      const seconds = reduceMotion ? 0 : now / 1000;
      const { points, edges, spacing, rowHeight } = lattice;
      const shiftY = reduceMotion ? 0 : scrollShift(window.scrollY, rowHeight);
      const amplitude = reduceMotion ? 0 : spacing * 0.07;
      const pointerActive = !reduceMotion && smoothed.strength > 0.01;

      const count = points.length / 2;
      const xs = new Float32Array(count);
      const ys = new Float32Array(count);
      const near = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const wander = drift(i, seconds, amplitude);
        let x = points[i * 2] + wander.x;
        let y = points[i * 2 + 1] + shiftY + wander.y;
        let lit = reduceMotion ? 0 : sweepIntensity(x, y, seconds, width, height);
        if (pointerActive) {
          const p = proximity(x, y, smoothed.x, smoothed.y, POINTER_RADIUS) * smoothed.strength;
          lit = Math.max(lit, p);
          if (p > 0) {
            // Vertices lean away from the pointer a little, so the lattice seems to give under it.
            const dx = x - smoothed.x;
            const dy = y - smoothed.y;
            const length = Math.hypot(dx, dy) || 1;
            x += (dx / length) * p * 7;
            y += (dy / length) * p * 7;
          }
        }
        near[i] = lit;
        xs[i] = x;
        ys[i] = y;
      }

      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;

      context.strokeStyle = LINE;
      for (let e = 0; e < edges.length; e += 2) {
        const a = edges[e];
        const b = edges[e + 1];
        context.globalAlpha = 0.46 * marginFade((xs[a] + xs[b]) / 2, width, CONTENT_WIDTH);
        context.beginPath();
        context.moveTo(xs[a], ys[a]);
        context.lineTo(xs[b], ys[b]);
        context.stroke();
      }

      if (!reduceMotion) {
        context.strokeStyle = ACCENT;
        for (let e = 0; e < edges.length; e += 2) {
          const a = edges[e];
          const b = edges[e + 1];
          const strength = (near[a] + near[b]) / 2;
          if (strength < 0.03) continue;
          context.globalAlpha = strength * 0.7;
          context.beginPath();
          context.moveTo(xs[a], ys[a]);
          context.lineTo(xs[b], ys[b]);
          context.stroke();
        }
      }

      for (let i = 0; i < count; i++) {
        const fade = marginFade(xs[i], width, CONTENT_WIDTH);
        context.globalAlpha = 0.7 * fade;
        context.fillStyle = DOT;
        context.beginPath();
        context.arc(xs[i], ys[i], 1.3, 0, Math.PI * 2);
        context.fill();
        if (near[i] > 0.03) {
          context.globalAlpha = near[i];
          context.fillStyle = ACCENT;
          context.beginPath();
          context.arc(xs[i], ys[i], 1.3 + near[i] * 1.8, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;

      const idle = now - pointer.seen > IDLE_MS;
      const target = idle ? 0 : 1;
      smoothed.strength += (target - smoothed.strength) * 0.12;
      smoothed.x += (pointer.x - smoothed.x) * 0.22;
      smoothed.y += (pointer.y - smoothed.y) * 0.22;
      draw(now);
    }

    function onPointer(event: PointerEvent) {
      if (smoothed.strength < 0.01) smoothed = { x: event.clientX, y: event.clientY, strength: 0 };
      pointer = { x: event.clientX, y: event.clientY, seen: performance.now() };
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      frame = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
