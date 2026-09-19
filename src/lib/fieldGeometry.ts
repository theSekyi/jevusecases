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
const MIN_SPACING = 8;
/** Extra rows below and above the viewport: one each side for drift, and two for the scroll shift. */
const SPARE_ROWS = 5;

/** The lattice that covers width x height, with spare rows and columns so it can drift and scroll without a gap. */
export function buildLattice(width: number, height: number, requestedSpacing: number): Lattice {
  const spacing = Math.max(MIN_SPACING, requestedSpacing);
  const rowHeight = spacing * ROW_RATIO;
  const columns = Math.ceil(Math.max(0, width) / spacing) + 3;
  const rows = Math.ceil(Math.max(0, height) / rowHeight) + SPARE_ROWS;

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

/** How visible the lattice is at this x: at `floor` under the content column, full in the margins. */
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
  // 0 minus, not a negation, so a zero shift is +0; an overscrolled (negative) scrollY counts as 0.
  return 0 - ((Math.max(0, scrollY) * rate) % period);
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

/** Radius, in pixels, of the pointer's reach. */
export const POINTER_RADIUS = 190;
/** How far, in pixels, a vertex leans away from the pointer at full strength. */
export const PUSH_PIXELS = 7;
/** Drift amplitude as a fraction of the lattice spacing. */
export const DRIFT_FRACTION = 0.07;
/** Below this brightness a line or dot is not drawn in the accent colour at all. */
export const ACCENT_THRESHOLD = 0.03;

/** Where every vertex is this frame, and how brightly it is lit (0 to 1). Reused between frames. */
export interface FrameState {
  xs: Float32Array;
  ys: Float32Array;
  lit: Float32Array;
  /** How visible each vertex is, from its resting x: faint under the content column. */
  fade: Float32Array;
}

export function createFrameState(lattice: Lattice, width: number, contentWidth: number): FrameState {
  const count = lattice.points.length / 2;
  const fade = new Float32Array(count);
  for (let i = 0; i < count; i++) fade[i] = marginFade(lattice.points[i * 2], width, contentWidth);
  return { xs: new Float32Array(count), ys: new Float32Array(count), lit: new Float32Array(count), fade };
}

export interface FrameInput {
  seconds: number;
  scrollY: number;
  width: number;
  height: number;
  /** False for reduced motion: nothing drifts, scrolls, sweeps or reacts. */
  animate: boolean;
  /** The pointer's smoothed position and how strongly it is felt right now (0 when idle). */
  pointer: { x: number; y: number; strength: number };
}

/**
 * Works out this frame's vertex positions and brightness. Drift and the scroll shift move the vertices, the
 * pointer pushes nearby ones away and lights them, and the sweep lights whatever it crosses. Writes into `frame`.
 */
export function updateFrame(frame: FrameState, lattice: Lattice, input: FrameInput): void {
  const { points, spacing, rowHeight } = lattice;
  const { seconds, scrollY, width, height, animate, pointer } = input;
  const amplitude = animate ? spacing * DRIFT_FRACTION : 0;
  const shiftY = animate ? scrollShift(scrollY, rowHeight) : 0;
  const pointerFelt = animate && pointer.strength > 0.01;
  const count = points.length / 2;

  for (let i = 0; i < count; i++) {
    const wander = drift(i, animate ? seconds : 0, amplitude);
    let x = points[i * 2] + wander.x;
    let y = points[i * 2 + 1] + shiftY + wander.y;
    let lit = animate ? sweepIntensity(x, y, seconds, width, height) : 0;

    if (pointerFelt) {
      const felt = proximity(x, y, pointer.x, pointer.y, POINTER_RADIUS) * pointer.strength;
      lit = Math.max(lit, felt);
      if (felt > 0) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const length = Math.hypot(dx, dy) || 1;
        x += (dx / length) * felt * PUSH_PIXELS;
        y += (dy / length) * felt * PUSH_PIXELS;
      }
    }

    frame.xs[i] = x;
    frame.ys[i] = y;
    frame.lit[i] = lit;
  }
}
