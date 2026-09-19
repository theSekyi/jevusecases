import { describe, expect, test } from "vitest";
import { MAX_TILT, rotationFor } from "../globe";
import {
  COAST_KEEP_PER_FRAME,
  IDLE_BEFORE_ROTATING_MS,
  MIN_COAST_DEGREES_PER_SECOND,
  STALE_FLING_MS,
  TURN_MS,
  beginTurn,
  createMotion,
  dragBy,
  endDrag,
  startDrag,
  stepMotion,
} from "../globeMotion";

const LONDON: [number, number] = [51.5, -0.1];
const TOKYO: [number, number] = [35.7, 139.7];

/** Steps the motion forward in `dt` seconds until `seconds` have passed, starting from `now`. */
function run(motion: ReturnType<typeof createMotion>, now: number, seconds: number, dt = 1 / 60) {
  let time = now;
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    time += dt * 1000;
    stepMotion(motion, time, dt);
  }
  return time;
}

describe("createMotion", () => {
  test("faces the given country, tilted no further than the poles allow", () => {
    const motion = createMotion(LONDON, 0, true);

    expect([motion.lambda, motion.phi]).toEqual(rotationFor(LONDON));
    expect(createMotion([89, 0], 0, true).phi).toBeGreaterThanOrEqual(-MAX_TILT);
  });

  test("faces a neutral view when there is no country", () => {
    expect(createMotion(null, 0, true)).toMatchObject({ lambda: 0, phi: -20 });
  });

  test("counts idle time from when it was made, not from the start of the page", () => {
    const motion = createMotion(LONDON, 60_000, true);

    expect(stepMotion(motion, 61_000, 1 / 60)).toBe(false);
    expect(stepMotion(motion, 60_000 + IDLE_BEFORE_ROTATING_MS + 1, 1 / 60)).toBe(true);
  });
});

describe("auto-rotation", () => {
  test("starts only after the idle time, and turns at a steady rate", () => {
    const motion = createMotion(LONDON, 0, true);
    const start = motion.lambda;

    const time = run(motion, 0, IDLE_BEFORE_ROTATING_MS / 1000 - 0.1);
    expect(motion.lambda).toBe(start);

    run(motion, time, 2);
    expect(motion.lambda).toBeGreaterThan(start);
  });

  test("waits while the pointer is over the globe or a drag is on, and starts again after", () => {
    const motion = createMotion(LONDON, 0, true);
    motion.hovering = true;
    const start = motion.lambda;
    const time = run(motion, 0, 6);
    expect(motion.lambda).toBe(start);

    motion.hovering = false;
    run(motion, time, 1);
    expect(motion.lambda).toBeGreaterThan(start);
  });

  test("never happens with reduced motion", () => {
    const motion = createMotion(LONDON, 0, false);
    const start = motion.lambda;

    run(motion, 0, 30);

    expect(motion.lambda).toBe(start);
  });
});

describe("dragging and coasting", () => {
  test("a drag turns the globe by the given degrees, and tilt is kept off the poles", () => {
    const motion = createMotion(LONDON, 0, true);
    const lambda = motion.lambda;
    startDrag(motion, 0);

    dragBy(motion, 10, 0, 16);
    expect(motion.lambda).toBeCloseTo(lambda + 10);

    dragBy(motion, 0, -500, 32);
    expect(motion.phi).toBe(MAX_TILT);
    dragBy(motion, 0, 500, 48);
    expect(motion.phi).toBe(-MAX_TILT);
  });

  test("a flick keeps coasting after release, slows down, and stops", () => {
    const motion = createMotion(LONDON, 0, true);
    startDrag(motion, 0);
    dragBy(motion, 6, 0, 16);
    endDrag(motion, 20);
    const released = motion.lambda;

    expect(motion.velocity).toBeGreaterThan(MIN_COAST_DEGREES_PER_SECOND);
    run(motion, 20, 0.5);
    const coasted = motion.lambda - released;
    expect(coasted).toBeGreaterThan(5);

    run(motion, 520, 6);
    expect(motion.velocity).toBe(0);
  });

  test("holding still before letting go is a stop, not a flick", () => {
    const motion = createMotion(LONDON, 0, true);
    startDrag(motion, 0);
    dragBy(motion, 6, 0, 16);

    endDrag(motion, 16 + STALE_FLING_MS + 1);

    expect(motion.velocity).toBe(0);
  });

  test("reduced motion never coasts", () => {
    const motion = createMotion(LONDON, 0, false);
    startDrag(motion, 0);
    dragBy(motion, 6, 0, 16);

    endDrag(motion, 20);

    expect(motion.velocity).toBe(0);
    expect(stepMotion(motion, 40, 1 / 60)).toBe(false);
  });

  test("the coast covers the same distance at any frame rate", () => {
    const at = (dt: number) => {
      const motion = createMotion(LONDON, 0, true);
      startDrag(motion, 0);
      dragBy(motion, 6, 0, 16);
      endDrag(motion, 20);
      const before = motion.lambda;
      run(motion, 20, 2, dt);
      return motion.lambda - before;
    };

    const reference = at(1 / 60);
    expect(Math.abs(at(1 / 120) - reference) / reference).toBeLessThan(0.05);
    expect(Math.abs(at(1 / 30) - reference) / reference).toBeLessThan(0.05);
    expect(COAST_KEEP_PER_FRAME).toBeLessThan(1);
  });

  test("does not move by itself while a drag is on", () => {
    const motion = createMotion(LONDON, 0, true);
    startDrag(motion, 0);

    expect(stepMotion(motion, 10_000, 1 / 60)).toBe(false);
  });
});

describe("turning to a country", () => {
  test("ends facing it, taking about TURN_MS, and easing out", () => {
    const motion = createMotion(LONDON, 0, true);
    beginTurn(motion, TOKYO, 0);
    const midway = () => {
      stepMotion(motion, TURN_MS / 4, 0.016);
      return motion.lambda;
    };
    const quarter = midway();

    run(motion, TURN_MS / 4, TURN_MS / 1000);

    expect(motion.turn).toBeNull();
    const [lambda, phi] = rotationFor(TOKYO);
    expect(motion.lambda).toBeCloseTo(lambda, 5);
    expect(motion.phi).toBeCloseTo(phi, 5);
    // Ease-out: a quarter of the time gets more than a quarter of the way.
    const start = rotationFor(LONDON)[0];
    expect((quarter - start) / (lambda - start)).toBeGreaterThan(0.25);
  });

  test("goes the short way round the world", () => {
    const motion = createMotion([0, 170], 0, true);
    beginTurn(motion, [0, -170], 0);

    stepMotion(motion, TURN_MS / 2, 0.016);

    // From longitude 170 to -170 is 20 degrees east, not 340 west, so it never swings past 180 degrees away.
    expect(Math.abs(motion.lambda - rotationFor([0, 170])[0])).toBeLessThan(20);
  });

  test("is instant with reduced motion", () => {
    const motion = createMotion(LONDON, 0, false);

    beginTurn(motion, TOKYO, 0);

    expect([motion.lambda, motion.phi]).toEqual(rotationFor(TOKYO));
    expect(motion.turn).toBeNull();
  });

  test("a new drag cancels a turn in progress, and a turn cancels a coast", () => {
    const motion = createMotion(LONDON, 0, true);
    beginTurn(motion, TOKYO, 0);
    startDrag(motion, 100);
    expect(motion.turn).toBeNull();

    motion.velocity = 50;
    beginTurn(motion, LONDON, 200);
    expect(motion.velocity).toBe(0);
  });

  test("rests where it lands: auto-rotation waits the full idle time after the turn ends, not after it began", () => {
    const motion = createMotion(LONDON, 0, true);
    beginTurn(motion, TOKYO, 10_000);
    const ended = run(motion, 10_000, 1.2);
    expect(motion.turn).toBeNull();

    expect(stepMotion(motion, ended + IDLE_BEFORE_ROTATING_MS - 400, 1 / 60)).toBe(false);
    expect(stepMotion(motion, ended + IDLE_BEFORE_ROTATING_MS + 400, 1 / 60)).toBe(true);
  });
});
