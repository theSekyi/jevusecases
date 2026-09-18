import { describe, expect, test } from "vitest";
import { buildLattice, drift, marginFade, proximity, scrollShift, spacingFor, sweepIntensity } from "../fieldGeometry";

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
    expect(scrollShift(0, rowHeight)).toBe(-0);
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
