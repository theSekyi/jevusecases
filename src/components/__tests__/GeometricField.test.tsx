import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { GeometricField } from "../GeometricField";
import { buildLattice, spacingFor } from "@/lib/fieldGeometry";

const ACCENT = "#fe843d";

function fakeContext() {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    lineWidth: 1,
    globalAlpha: 1,
  };
  Object.defineProperty(context, "strokeStyle", { set: (value: string) => strokeStyles.push(value), get: () => strokeStyles.at(-1) });
  Object.defineProperty(context, "fillStyle", { set: (value: string) => fillStyles.push(value), get: () => fillStyles.at(-1) });
  return { context, strokeStyles, fillStyles };
}

/** A media query whose "reduce motion" answer can be flipped, telling the component when it changes. */
function stubMotionPreference(reduced: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduced,
    addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(query));
  return {
    change(nextReduced: boolean) {
      query.matches = nextReduced;
      act(() => listeners.forEach((listener) => listener()));
    },
    listeners,
  };
}

/** A hand-cranked animation clock, so tests decide exactly when frames run. */
function stubClock() {
  let now = 0;
  let pending: FrameRequestCallback | null = null;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const request = vi.fn((callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  const cancel = vi.fn(() => {
    pending = null;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
    /** Runs one frame, `ms` after the last. */
    frame(ms = 40) {
      now += ms;
      const callback = pending;
      pending = null;
      act(() => callback?.(now));
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

function press(type: "pointermove" | "pointerdown", x: number, y: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  });
}

describe("GeometricField", () => {
  beforeEach(() => {
    stubMotionPreference(false);
    Object.defineProperty(document.documentElement, "clientWidth", { value: 1024, configurable: true });
    Object.defineProperty(document.documentElement, "clientHeight", { value: 768, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount(reduced = false) {
    const motion = stubMotionPreference(reduced);
    const clock = stubClock();
    const drawing = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(drawing.context as unknown as CanvasRenderingContext2D);
    const view = render(<GeometricField />);
    return { ...drawing, ...view, motion, clock };
  }

  test("is a decorative canvas that can't take clicks or be read by a screen reader", () => {
    const { container } = mount();

    const canvas = container.querySelector("canvas")!;
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none", "fixed", "-z-10");
  });

  test("with reduced motion it draws exactly the lattice once: every line and every dot, in no accent colour", () => {
    const { context, strokeStyles, fillStyles, clock } = mount(true);
    const lattice = buildLattice(1024, 768, spacingFor(1024));

    expect(context.moveTo).toHaveBeenCalledTimes(lattice.edges.length / 2 * 2);
    expect(context.arc).toHaveBeenCalledTimes((lattice.points.length / 2) * 2);
    expect([...strokeStyles, ...fillStyles]).not.toContain(ACCENT);
    expect(clock.request).not.toHaveBeenCalled();
  });

  test("animating, the pointer lights up dots around it, and they fade again once it goes quiet", () => {
    // Dots grow when lit. Count the grown ones near the spot; the slow sweep is the same at times 14 s apart.
    const grownNear = (context: ReturnType<typeof fakeContext>["context"]) =>
      context.arc.mock.calls.filter(([x, y, radius]) => radius > 1.35 && Math.hypot(x - 512, y - 384) < 100).length;
    const lastFrame = (clock: ReturnType<typeof stubClock>, context: ReturnType<typeof fakeContext>["context"]) => {
      context.arc.mockClear();
      clock.frame();
      return grownNear(context);
    };

    const quiet = mount();
    for (let i = 0; i < 24; i++) quiet.clock.frame();
    const resting = lastFrame(quiet.clock, quiet.context);
    quiet.unmount();

    const touched = mount();
    press("pointerdown", 512, 384);
    for (let i = 0; i < 24; i++) touched.clock.frame();
    const during = lastFrame(touched.clock, touched.context);

    touched.clock.advance(12360);
    for (let i = 0; i < 40; i++) touched.clock.frame();
    const after = lastFrame(touched.clock, touched.context);

    expect(during).toBeGreaterThanOrEqual(resting + 5);
    expect(after).toBeLessThanOrEqual(resting + 3);
  });

  test("a press seeds the highlight where it lands, instead of sliding in from wherever it faded", () => {
    const { context, clock } = mount();
    press("pointermove", 100, 100);
    for (let i = 0; i < 10; i++) clock.frame();

    press("pointerdown", 900, 600);
    context.arc.mockClear();
    clock.frame();
    const nearNewSpot = context.arc.mock.calls.filter(([x, y]) => Math.hypot(x - 900, y - 600) < 190).length;

    expect(nearNewSpot).toBeGreaterThan(0);
  });

  test("keeps drawing frames while animating, and stops when it unmounts", () => {
    const { clock, unmount } = mount();

    clock.frame();
    clock.frame();
    expect(clock.request.mock.calls.length).toBeGreaterThan(2);

    unmount();
    expect(clock.cancel).toHaveBeenCalled();
  });

  test("removes the very handlers it added when it unmounts", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = mount();

    const added = (type: string) => add.mock.calls.find(([name]) => name === type)?.[1];
    unmount();

    for (const type of ["pointermove", "pointerdown", "resize"]) {
      expect(remove).toHaveBeenCalledWith(type, added(type));
    }
  });

  test("redraws when the window changes size, and does nothing when the size is unchanged", () => {
    const { context, container } = mount();
    const canvas = container.querySelector("canvas")!;

    context.clearRect.mockClear();
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(context.clearRect).not.toHaveBeenCalled();

    Object.defineProperty(document.documentElement, "clientWidth", { value: 600, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(context.clearRect).toHaveBeenCalled();
    expect(canvas.width).toBe(600);
  });

  test("follows the Reduce Motion setting while the page is open", () => {
    const { motion, clock, strokeStyles } = mount();
    const remove = vi.spyOn(window, "removeEventListener");
    clock.request.mockClear();

    motion.change(true);

    expect(clock.cancel).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(clock.request).not.toHaveBeenCalled();
    const stylesAfterStill = strokeStyles.length;

    motion.change(false);

    expect(clock.request).toHaveBeenCalled();
    expect(strokeStyles.length).toBeGreaterThanOrEqual(stylesAfterStill);
  });

  test("stops listening for the preference change when it unmounts", () => {
    const { motion, unmount } = mount();
    expect(motion.listeners.size).toBe(1);

    unmount();

    expect(motion.listeners.size).toBe(0);
  });

  test("does nothing, and doesn't throw, where a canvas has no 2D context", () => {
    stubMotionPreference(false);
    const clock = stubClock();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => render(<GeometricField />)).not.toThrow();
    expect(clock.request).not.toHaveBeenCalled();
  });

  test("draws still, without throwing, where matchMedia doesn't exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    const clock = stubClock();
    const { context } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);

    expect(() => render(<GeometricField />)).not.toThrow();
    expect(context.arc).toHaveBeenCalled();
    expect(clock.request).toHaveBeenCalled();
  });
});
