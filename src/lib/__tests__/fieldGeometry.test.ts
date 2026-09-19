import { describe, expect, test } from "vitest";
import {
  ACCENT_THRESHOLD,
  DRIFT_FRACTION,
  POINTER_RADIUS,
  PUSH_PIXELS,
  buildLattice,
  createFrameState,
  drift,
  marginFade,
  proximity,
  scrollShift,
  spacingFor,
  sweepIntensity,
  updateFrame,
  type FrameInput,
} from "../fieldGeometry";

describe("buildLattice", () => {
  const lattice = buildLattice(640, 480, 64);

  test("covers the viewport with a margin on every side", () => {
    const xs = Array.from({ length: lattice.points.length / 2 }, (_, i) => lattice.points[i * 2]);
    const ys = Array.from({ length: lattice.points.length / 2 }, (_, i) => lattice.points[i * 2 + 1]);

    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(640);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(480);
  });

  test("shifts every other row by half a step, which is what makes the triangles", () => {
    const firstX = (row: number) => lattice.points[row * lattice.columns * 2];

    expect(firstX(1) - firstX(0)).toBeCloseTo(32);
    expect(firstX(2) - firstX(0)).toBeCloseTo(0);
  });

  test("every line joins two real vertices and is exactly one step long", () => {
    const count = lattice.points.length / 2;
    expect(lattice.edges.length % 2).toBe(0);

    for (let e = 0; e < lattice.edges.length; e += 2) {
      const a = lattice.edges[e];
      const b = lattice.edges[e + 1];
      expect(a).toBeLessThan(count);
      expect(b).toBeLessThan(count);
      const length = Math.hypot(
        lattice.points[a * 2] - lattice.points[b * 2],
        lattice.points[a * 2 + 1] - lattice.points[b * 2 + 1],
      );
      expect(length).toBeCloseTo(64, 3);
    }
  });

  test("has no duplicate lines", () => {
    const seen = new Set<string>();
    for (let e = 0; e < lattice.edges.length; e += 2) {
      const key = [lattice.edges[e], lattice.edges[e + 1]].sort((a, b) => a - b).join("-");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("still covers the bottom of the viewport when scrolled by the furthest shift", () => {
    for (const [width, height] of [
      [1280, 720],
      [1440, 900],
      [1440, 1000],
      [375, 812],
      [2560, 1440],
    ]) {
      const spacing = spacingFor(width);
      const grid = buildLattice(width, height, spacing);
      const bottom = grid.points[(grid.rows * grid.columns - 1) * 2 + 1];
      const worstShift = -grid.rowHeight * 2;
      const worstDrift = spacing * DRIFT_FRACTION;

      expect(bottom + worstShift - worstDrift, `${width}x${height}`).toBeGreaterThanOrEqual(height);
    }
  });

  test("survives a zero-size viewport, a tiny one and a spacing bigger than the screen", () => {
    for (const [width, height, spacing] of [
      [0, 0, 64],
      [1, 1, 64],
      [100, 100, 400],
      [640, 480, 0],
    ]) {
      const grid = buildLattice(width, height, spacing);
      expect(grid.points.length).toBeGreaterThan(0);
      expect(grid.edges.length).toBeGreaterThan(0);
      expect(grid.spacing).toBeGreaterThanOrEqual(8);
    }
  });

  test("an interior vertex has six neighbours, the shape of a triangular lattice", () => {
    const degree = new Map<number, number>();
    for (let e = 0; e < lattice.edges.length; e++) degree.set(lattice.edges[e], (degree.get(lattice.edges[e]) ?? 0) + 1);
    const interior = 3 * lattice.columns + 4;

    expect(degree.get(interior)).toBe(6);
  });
});

describe("proximity", () => {
  test("is 1 at the pointer, 0 at and beyond the radius, and falls smoothly between", () => {
    expect(proximity(10, 10, 10, 10, 100)).toBe(1);
    expect(proximity(110, 10, 10, 10, 100)).toBe(0);
    expect(proximity(500, 500, 10, 10, 100)).toBe(0);
    const half = proximity(60, 10, 10, 10, 100);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });

  test("never increases with distance", () => {
    let previous = 1;
    for (let d = 0; d <= 100; d += 5) {
      const value = proximity(d, 0, 0, 0, 100);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      previous = value;
    }
  });
});

describe("marginFade", () => {
  test("is faint under the content column and full at the edges", () => {
    expect(marginFade(720, 1440, 1152)).toBeCloseTo(0.32);
    expect(marginFade(0, 1440, 1152)).toBeCloseTo(1);
    expect(marginFade(1440, 1440, 1152)).toBeCloseTo(1);
  });

  test("never drops below the floor, and copes with a viewport narrower than the content", () => {
    for (let x = 0; x <= 1440; x += 60) {
      expect(marginFade(x, 1440, 1152)).toBeGreaterThanOrEqual(0.32);
    }
    expect(marginFade(100, 375, 1152)).toBe(0.32);
  });
});

describe("drift", () => {
  test("stays within the amplitude and is repeatable", () => {
    for (let i = 0; i < 50; i++) {
      const { x, y } = drift(i, i * 1.7, 4);
      expect(Math.abs(x)).toBeLessThanOrEqual(4);
      expect(Math.abs(y)).toBeLessThanOrEqual(4);
      expect(drift(i, i * 1.7, 4)).toEqual({ x, y });
    }
  });

  test("gives neighbouring vertices different motion, so the lattice ripples", () => {
    expect(drift(1, 5, 4)).not.toEqual(drift(2, 5, 4));
  });

  test("does not move at all with zero amplitude", () => {
    const { x, y } = drift(3, 9, 0);
    expect(Math.abs(x) + Math.abs(y)).toBe(0);
  });
});

describe("spacingFor / scrollShift", () => {
  test("tighter on phones", () => {
    expect(spacingFor(375)).toBeLessThan(spacingFor(1440));
  });

  test("wraps the scroll shift into one vertical period, so the pattern repeats seamlessly", () => {
    const rowHeight = 55;
    for (const scroll of [0, 100, 5000, 123456]) {
      const shift = scrollShift(scroll, rowHeight);
      expect(shift).toBeLessThanOrEqual(0);
      expect(shift).toBeGreaterThan(-rowHeight * 2);
    }
    expect(scrollShift(0, rowHeight)).toBe(0);
    expect(Object.is(scrollShift(0, rowHeight), 0)).toBe(true);
  });

  test("treats an overscrolled (negative) scroll position as the top", () => {
    expect(scrollShift(-100, 55)).toBe(0);
  });

  test("switches to the tighter spacing below 640px", () => {
    expect(spacingFor(639)).toBe(44);
    expect(spacingFor(640)).toBe(64);
  });
});

describe("sweepIntensity", () => {
  test("is a band: bright at its centre, gone outside it", () => {
    let brightest = 0;
    let quiet = 0;
    for (let x = 0; x < 1440; x += 10) {
      const value = sweepIntensity(x, 0, 3, 1440, 900);
      brightest = Math.max(brightest, value);
      if (value === 0) quiet++;
    }
    expect(brightest).toBeGreaterThan(0.25);
    expect(brightest).toBeLessThanOrEqual(0.32);
    expect(quiet).toBeGreaterThan(50);
  });

  test("moves across the page over time and repeats", () => {
    const at = (seconds: number) => sweepIntensity(700, 300, seconds, 1440, 900);
    const times = Array.from({ length: 28 }, (_, i) => i * 0.5);

    expect(Math.max(...times.map(at))).toBeGreaterThan(0.25);
    expect(times.filter((t) => at(t) === 0).length).toBeGreaterThan(10);
    expect(at(1.25)).toBeCloseTo(at(1.25 + 14));
  });
});

describe("updateFrame", () => {
  const width = 1200;
  const height = 800;
  const lattice = buildLattice(width, height, 64);
  const still = { x: -9999, y: -9999, strength: 0 };

  const input = (overrides: Partial<FrameInput> = {}): FrameInput => ({
    seconds: 3,
    scrollY: 0,
    width,
    height,
    animate: true,
    pointer: still,
    ...overrides,
  });
  const run = (overrides: Partial<FrameInput> = {}) => {
    const frame = createFrameState(lattice, width, 1152);
    updateFrame(frame, lattice, input(overrides));
    return frame;
  };
  const vertexNear = (x: number, y: number) => {
    let best = 0;
    for (let i = 1; i < lattice.points.length / 2; i++) {
      const a = Math.hypot(lattice.points[i * 2] - x, lattice.points[i * 2 + 1] - y);
      const b = Math.hypot(lattice.points[best * 2] - x, lattice.points[best * 2 + 1] - y);
      if (a < b) best = i;
    }
    return best;
  };

  test("with animation off, every vertex rests where the lattice put it and nothing is lit", () => {
    const frame = run({ animate: false, scrollY: 900, pointer: { x: 600, y: 400, strength: 1 } });

    for (let i = 0; i < lattice.points.length / 2; i++) {
      expect(frame.xs[i]).toBeCloseTo(lattice.points[i * 2], 4);
      expect(frame.ys[i]).toBeCloseTo(lattice.points[i * 2 + 1], 4);
      expect(frame.lit[i]).toBe(0);
    }
  });

  test("drift and scroll move the vertices, but only by a little and a whole number of periods apart", () => {
    const frame = run({ scrollY: 300 });
    const shift = scrollShift(300, lattice.rowHeight);

    for (let i = 0; i < lattice.points.length / 2; i += 17) {
      expect(Math.abs(frame.xs[i] - lattice.points[i * 2])).toBeLessThanOrEqual(lattice.spacing * DRIFT_FRACTION + 1e-3);
      expect(Math.abs(frame.ys[i] - (lattice.points[i * 2 + 1] + shift))).toBeLessThanOrEqual(lattice.spacing * DRIFT_FRACTION + 1e-3);
    }
  });

  test("the pointer lights the vertices around it and leaves the rest as they were", () => {
    const target = vertexNear(600, 400);
    const without = run();
    const withPointer = run({ pointer: { x: lattice.points[target * 2], y: lattice.points[target * 2 + 1], strength: 1 } });

    expect(withPointer.lit[target]).toBeGreaterThan(0.9);
    let changed = 0;
    for (let i = 0; i < lattice.points.length / 2; i++) {
      const distance = Math.hypot(without.xs[i] - lattice.points[target * 2], without.ys[i] - lattice.points[target * 2 + 1]);
      if (distance > POINTER_RADIUS + PUSH_PIXELS + 30) {
        expect(withPointer.lit[i]).toBe(without.lit[i]);
        expect(withPointer.xs[i]).toBe(without.xs[i]);
      } else if (withPointer.lit[i] !== without.lit[i]) {
        changed++;
      }
    }
    expect(changed).toBeGreaterThan(5);
  });

  test("vertices lean away from the pointer, by no more than the push", () => {
    const target = vertexNear(600, 400);
    const px = lattice.points[target * 2] - 20;
    const py = lattice.points[target * 2 + 1];
    const without = run();
    const withPointer = run({ pointer: { x: px, y: py, strength: 1 } });

    const before = Math.hypot(without.xs[target] - px, without.ys[target] - py);
    const after = Math.hypot(withPointer.xs[target] - px, withPointer.ys[target] - py);
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThanOrEqual(PUSH_PIXELS + 1e-3);
  });

  test("a pointer with no strength (idle) is ignored, however close it is", () => {
    const target = vertexNear(600, 400);
    const idle = run({ pointer: { x: lattice.points[target * 2], y: lattice.points[target * 2 + 1], strength: 0 } });
    const without = run();

    expect(Array.from(idle.lit)).toEqual(Array.from(without.lit));
    expect(Array.from(idle.xs)).toEqual(Array.from(without.xs));
  });

  test("the sweep lights part of the lattice as time passes, and never above its peak", () => {
    let brightest = 0;
    let anyDark = false;
    for (let seconds = 0; seconds < 14; seconds += 1) {
      const frame = run({ seconds });
      brightest = Math.max(brightest, ...frame.lit);
      if (frame.lit.some((value) => value < ACCENT_THRESHOLD)) anyDark = true;
    }

    expect(brightest).toBeGreaterThan(0.25);
    expect(brightest).toBeLessThanOrEqual(0.33);
    expect(anyDark).toBe(true);
  });

  test("reuses the arrays it is given instead of allocating new ones", () => {
    const frame = createFrameState(lattice, width, 1152);
    const { xs, ys, lit } = frame;

    updateFrame(frame, lattice, input());
    updateFrame(frame, lattice, input({ seconds: 4 }));

    expect(frame.xs).toBe(xs);
    expect(frame.ys).toBe(ys);
    expect(frame.lit).toBe(lit);
  });
});

describe("createFrameState", () => {
  test("gives every vertex a fade, faint under the content column and full at the edges", () => {
    const grid = buildLattice(1440, 900, 64);
    const frame = createFrameState(grid, 1440, 1152);
    const fades = Array.from(frame.fade);

    expect(fades).toHaveLength(grid.points.length / 2);
    expect(Math.min(...fades)).toBeCloseTo(0.32);
    expect(Math.max(...fades)).toBeCloseTo(1, 1);
  });
});
