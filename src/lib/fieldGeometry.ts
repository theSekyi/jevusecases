/** A triangular lattice: rows of evenly spaced points, every other row shifted half a step. */
export interface Lattice {
  spacing: number;
  rowHeight: number;
  columns: number;
  rows: number;
  /** x, y pairs for each vertex, row by row. */
  points: Float32Array;
  /** Vertex index pairs, one per line. */
  edges: Uint32Array;
}

const ROW_RATIO = Math.sqrt(3) / 2;

/** The lattice that covers width x height with one extra row and column on every side, so it can drift and scroll. */
export function buildLattice(width: number, height: number, spacing: number): Lattice {
  const rowHeight = spacing * ROW_RATIO;
  const columns = Math.ceil(width / spacing) + 3;
  const rows = Math.ceil(height / rowHeight) + 3;

  const points = new Float32Array(columns * rows * 2);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = (row * columns + column) * 2;
      points[index] = (column - 1) * spacing + (row % 2 === 1 ? spacing / 2 : 0);
      points[index + 1] = (row - 1) * rowHeight;
    }
  }

  const edges: number[] = [];
  const at = (row: number, column: number) => row * columns + column;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (column + 1 < columns) edges.push(at(row, column), at(row, column + 1));
      if (row + 1 >= rows) continue;
      // An even row's points sit half a step left of the odd row below, so they join the same and previous column.
      const below = row % 2 === 0 ? [column - 1, column] : [column, column + 1];
      for (const target of below) {
        if (target >= 0 && target < columns) edges.push(at(row, column), at(row + 1, target));
      }
    }
  }

  return { spacing, rowHeight, columns, rows, points, edges: Uint32Array.from(edges) };
}

/** 1 at the pointer, easing to 0 at the radius. Smooth at both ends so nothing pops. */
export function proximity(x: number, y: number, pointerX: number, pointerY: number, radius: number): number {
  const distance = Math.hypot(x - pointerX, y - pointerY);
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t * (3 - 2 * t);
}

/** How visible the lattice is at this x: faint under the content column, full in the margins. */
export function marginFade(x: number, width: number, contentWidth: number, floor = 0.32): number {
  const centre = width / 2;
  const halfContent = contentWidth / 2;
  const away = Math.abs(x - centre) - halfContent;
  if (away <= 0) return floor;
  const t = Math.min(1, away / Math.max(1, centre - halfContent));
  const eased = t * t * (3 - 2 * t);
  return floor + (1 - floor) * eased;
}

/** A small, slow, repeatable wander for one vertex. Each vertex has its own phase so the lattice ripples, not sways. */
export function drift(index: number, seconds: number, amplitude: number): { x: number; y: number } {
  const phaseA = index * 12.9898;
  const phaseB = index * 78.233;
  return {
    x: Math.sin(seconds * 0.33 + phaseA) * amplitude,
    y: Math.cos(seconds * 0.27 + phaseB) * amplitude,
  };
}

/** Lattice spacing for a viewport width: tighter on phones so the pattern still reads as a pattern. */
export function spacingFor(width: number): number {
  return width < 640 ? 44 : 64;
}

/** Wraps a scroll-driven shift into one vertical period of the lattice (two rows), so the pattern repeats seamlessly. */
export function scrollShift(scrollY: number, rowHeight: number, rate = 0.12): number {
  const period = rowHeight * 2;
  return -((scrollY * rate) % period);
}

const SWEEP_SECONDS = 14;
const SWEEP_WIDTH = 240;

/**
 * A faint band of light that crosses the page on a slow diagonal and repeats, so the lattice has some life
 * even when nobody is moving the pointer. 0 outside the band, `peak` at its centre.
 */
export function sweepIntensity(x: number, y: number, seconds: number, width: number, height: number, peak = 0.32): number {
  const travel = width + height * 0.5 + SWEEP_WIDTH * 2;
  const centre = ((seconds % SWEEP_SECONDS) / SWEEP_SECONDS) * travel - SWEEP_WIDTH;
  const distance = Math.abs(x + y * 0.5 - centre);
  if (distance >= SWEEP_WIDTH) return 0;
  const t = 1 - distance / SWEEP_WIDTH;
  return peak * t * t * (3 - 2 * t);
}
