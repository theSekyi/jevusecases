import { clampTilt, rotationFor, shortestTurn } from "./globe";

/** How long a turn to a chosen country takes. */
export const TURN_MS = 900;
/** How long the globe must be left alone before it starts turning by itself. */
export const IDLE_BEFORE_ROTATING_MS = 3500;
export const AUTO_ROTATE_DEGREES_PER_SECOND = 5;
/** Share of its speed a coasting globe keeps each sixtieth of a second. */
export const COAST_KEEP_PER_FRAME = 0.94;
/** A coast slower than this counts as stopped. */
export const MIN_COAST_DEGREES_PER_SECOND = 1.2;
/** A release this long after the last move is a stop, not a flick. */
export const STALE_FLING_MS = 80;
/** A move measured over less than this is treated as this long, so two events in one instant can't give a huge speed. */
const MIN_MOVE_MS = 8;

export interface Turn {
  start: number;
  fromLambda: number;
  turn: number;
  fromPhi: number;
  toPhi: number;
}

/** Everything about how the globe is turning. The component owns one and calls the functions below on it. */
export interface MotionState {
  lambda: number;
  phi: number;
  /** Degrees of longitude per second it is coasting at after a drag. */
  velocity: number;
  dragging: boolean;
  hovering: boolean;
  /** False under reduced motion: no auto-rotation, no coasting, turns are instant. */
  animate: boolean;
  lastInteraction: number;
  lastMoveAt: number;
  turn: Turn | null;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A fresh state, facing `centre` ([latitude, longitude]) if there is one. Auto-rotation waits from `now`. */
export function createMotion(centre: [number, number] | null, now: number, animate: boolean): MotionState {
  const [lambda, phi] = centre ? rotationFor(centre) : [0, -20];
  return {
    lambda,
    phi: clampTilt(phi),
    velocity: 0,
    dragging: false,
    hovering: false,
    animate,
    lastInteraction: now,
    lastMoveAt: now,
    turn: null,
  };
}

export function startDrag(motion: MotionState, now: number): void {
  motion.dragging = true;
  motion.turn = null;
  motion.velocity = 0;
  motion.lastInteraction = now;
  motion.lastMoveAt = now;
}

/** Turns the globe by a drag, in degrees, and remembers how fast that was. */
export function dragBy(motion: MotionState, dLambda: number, dPhi: number, now: number): void {
  motion.lambda += dLambda;
  motion.phi = clampTilt(motion.phi - dPhi);
  motion.velocity = (dLambda / Math.max(MIN_MOVE_MS, now - motion.lastMoveAt)) * 1000;
  motion.lastMoveAt = now;
  motion.lastInteraction = now;
}

/** Lets go. A flick keeps coasting; holding still first, or reduced motion, stops it dead. */
export function endDrag(motion: MotionState, now: number): void {
  motion.dragging = false;
  motion.lastInteraction = now;
  if (!motion.animate || now - motion.lastMoveAt > STALE_FLING_MS) motion.velocity = 0;
}

/** Starts a turn to face `centre` ([latitude, longitude]). Instant under reduced motion. */
export function beginTurn(motion: MotionState, centre: [number, number], now: number): void {
  const [toLambda, toPhi] = rotationFor(centre);
  motion.velocity = 0;
  motion.lastInteraction = now;
  if (!motion.animate) {
    motion.lambda = toLambda;
    motion.phi = clampTilt(toPhi);
    motion.turn = null;
    return;
  }
  motion.turn = {
    start: now,
    fromLambda: motion.lambda,
    turn: shortestTurn(motion.lambda, toLambda),
    fromPhi: motion.phi,
    toPhi: clampTilt(toPhi),
  };
}

/** Moves the globe on by `dt` seconds. Returns true if it moved, so the caller knows to redraw. */
export function stepMotion(motion: MotionState, now: number, dt: number): boolean {
  if (motion.turn) {
    const t = Math.min(1, (now - motion.turn.start) / TURN_MS);
    const eased = easeOut(t);
    motion.lambda = motion.turn.fromLambda + motion.turn.turn * eased;
    motion.phi = motion.turn.fromPhi + (motion.turn.toPhi - motion.turn.fromPhi) * eased;
    if (t >= 1) {
      motion.turn = null;
      // Let it rest where it landed, so you can see where that is before it starts drifting again.
      motion.lastInteraction = now;
    }
    return true;
  }
  if (motion.dragging) return false;

  if (Math.abs(motion.velocity) > MIN_COAST_DEGREES_PER_SECOND) {
    motion.lambda += motion.velocity * dt;
    motion.velocity *= Math.pow(COAST_KEEP_PER_FRAME, dt * 60);
    if (Math.abs(motion.velocity) <= MIN_COAST_DEGREES_PER_SECOND) motion.velocity = 0;
    return true;
  }
  motion.velocity = 0;

  if (motion.animate && !motion.hovering && now - motion.lastInteraction > IDLE_BEFORE_ROTATING_MS) {
    motion.lambda += AUTO_ROTATE_DEGREES_PER_SECOND * dt;
    return true;
  }
  return false;
}
