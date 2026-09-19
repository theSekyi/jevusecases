import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { geoOrthographic } from "d3-geo";
import { TrafficGlobe, type GlobeFocus } from "../admin/TrafficGlobe";
import { GLOBE_COLORS, centreOf, heatColor, markerRadius, rotationFor } from "@/lib/globe";
import { COUNTRY_SHAPES } from "@/lib/globeShapes";
import { IDLE_BEFORE_ROTATING_MS, STALE_FLING_MS } from "@/lib/globeMotion";
import type { TrafficRow } from "@/lib/trafficStats";

const SIZE = 400;

function fakeContext() {
  const fills: string[] = [];
  const strokes: string[] = [];
  const lineWidths: number[] = [];
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  };
  Object.defineProperty(context, "fillStyle", { set: (value: string) => fills.push(value), get: () => fills.at(-1) });
  Object.defineProperty(context, "strokeStyle", { set: (value: string) => strokes.push(value), get: () => strokes.at(-1) });
  Object.defineProperty(context, "lineWidth", { set: (value: number) => lineWidths.push(value), get: () => lineWidths.at(-1) });
  return { context, fills, strokes, lineWidths };
}

function stubClock(startAt = 0) {
  let now = startAt;
  let pending: FrameRequestCallback | null = null;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  const cancel = vi.fn(() => {
    pending = null;
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    cancel,
    frame(ms = 16) {
      now += ms;
      const callback = pending;
      pending = null;
      act(() => callback?.(now));
    },
    /** Runs frames until `ms` has passed. */
    run(ms: number, step = 16) {
      for (let elapsed = 0; elapsed < ms; elapsed += step) this.frame(step);
    },
    /** Lets time pass with no frames, as when the pointer is held still. */
    wait(ms: number) {
      now += ms;
    },
  };
}

function stubReducedMotion(reduced: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduced,
    addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(query));
  return {
    listeners,
    change(next: boolean) {
      query.matches = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

function rowsFor(...countries: [string, number][]): TrafficRow[] {
  return countries.map(([country, views]) => ({ kind: "country", country, views, visitors: Math.max(1, Math.round(views / 3)) }));
}

/** Where a country's centre lands on the canvas once the globe has turned to face `facing`. */
function pixelFor(code: string, facing: string): [number, number] {
  const [lambda, phi] = rotationFor(centreOf(facing)!);
  const projection = geoOrthographic().translate([SIZE / 2, SIZE / 2]).scale(SIZE / 2 - 6).rotate([lambda, phi]);
  const [lat, lon] = centreOf(code)!;
  return projection([lon, lat]) as [number, number];
}

interface PointerOptions {
  x?: number;
  y?: number;
  id?: number;
  pointerType?: string;
  button?: number;
}

function pointerEvent(type: string, { x = 0, y = 0, id = 1, pointerType = "mouse", button = 0 }: PointerOptions = {}) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: id });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

const observerCallbacks: (() => void)[] = [];
const disconnect = vi.fn();

describe("TrafficGlobe", () => {
  let drawing: ReturnType<typeof fakeContext>;

  beforeEach(() => {
    drawing = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(drawing.context as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => currentWidth });
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLCanvasElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLCanvasElement.prototype, "hasPointerCapture", { configurable: true, value: vi.fn().mockReturnValue(true) });
    currentWidth = SIZE;
    observerCallbacks.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observerCallbacks.push(callback);
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    disconnect.mockClear();
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLCanvasElement.prototype as { setPointerCapture?: unknown }).setPointerCapture;
    delete (HTMLCanvasElement.prototype as { releasePointerCapture?: unknown }).releasePointerCapture;
    delete (HTMLCanvasElement.prototype as { hasPointerCapture?: unknown }).hasPointerCapture;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  let currentWidth = SIZE;

  function mount({
    rows = rowsFor(["GB", 100], ["US", 40]),
    reduced = false,
    highlighted = null as string | null,
    focus = null as GlobeFocus | null,
    startAt = 0,
  } = {}) {
    const clock = stubClock(startAt);
    const motion = stubReducedMotion(reduced);
    const onHighlight = vi.fn();
    const view = render(<TrafficGlobe rows={rows} highlighted={highlighted} onHighlight={onHighlight} focus={focus} />);
    const canvas = view.container.querySelector("canvas")!;
    const send = (type: string, options?: PointerOptions) => act(() => void canvas.dispatchEvent(pointerEvent(type, options)));
    clock.frame();
    return {
      ...view,
      clock,
      motion,
      onHighlight,
      canvas,
      send,
      move: (x: number, y: number, options?: PointerOptions) => send("pointermove", { x, y, ...options }),
      down: (x: number, y: number, options?: PointerOptions) => send("pointerdown", { x, y, ...options }),
      up: (options?: PointerOptions) => send("pointerup", options),
      leave: () => send("pointerleave"),
      rerenderWith: (props: Partial<{ rows: TrafficRow[]; highlighted: string | null; focus: GlobeFocus | null }>) =>
        view.rerender(
          <TrafficGlobe
            rows={props.rows ?? rows}
            highlighted={props.highlighted === undefined ? highlighted : props.highlighted}
            onHighlight={onHighlight}
            focus={props.focus === undefined ? focus : props.focus}
          />,
        ),
    };
  }

  /** Runs a frame and returns a fingerprint of where its shapes were drawn, to tell whether the globe turned. */
  const pictureOf = (clock: ReturnType<typeof stubClock>) => {
    drawing.context.moveTo.mockClear();
    clock.frame();
    return JSON.stringify(drawing.context.moveTo.mock.calls.slice(0, 40));
  };
  /** True if the globe is still moving. The first frame after an event may redraw for the event itself, so it is skipped. */
  const moved = (clock: ReturnType<typeof stubClock>) => {
    clock.frame();
    drawing.context.moveTo.mockClear();
    clock.frame();
    return drawing.context.moveTo.mock.calls.length > 0;
  };

  test("draws the sphere, every country shape and the rim", () => {
    mount();

    expect(drawing.context.clearRect).toHaveBeenCalled();
    expect(drawing.context.fill.mock.calls.length).toBeGreaterThanOrEqual(COUNTRY_SHAPES.length + 1);
    expect(drawing.context.stroke.mock.calls.length).toBeGreaterThan(COUNTRY_SHAPES.length);
    expect(drawing.strokes).toContain(GLOBE_COLORS.rim);
  });

  test("colours a country by its heat, and leaves every other country the plain land colour", () => {
    mount({ rows: rowsFor(["GB", 100], ["US", 25]) });

    expect(drawing.fills).toContain(heatColor(1));
    expect(drawing.fills).toContain(GLOBE_COLORS.land);
    const heatColours = new Set(drawing.fills.filter((colour) => colour !== GLOBE_COLORS.land && colour !== GLOBE_COLORS.sphere));
    expect(heatColours.size).toBe(2);
  });

  test("draws nothing for countries the list folded into Other or Unknown", () => {
    mount({ rows: [{ kind: "other", views: 40, visitors: 9 }, { kind: "unknown", views: 12, visitors: 3 }] });

    const heatColours = drawing.fills.filter((colour) => colour !== GLOBE_COLORS.land && colour !== GLOBE_COLORS.sphere);
    expect(heatColours).toEqual([]);
    expect(drawing.context.arc).not.toHaveBeenCalled();
  });

  test("marks a small state that has no shape with a dot at its centre, sized by heat", () => {
    mount({ rows: rowsFor(["SG", 40]) });

    expect(drawing.context.arc).toHaveBeenCalledTimes(1);
    const [x, y, radius] = drawing.context.arc.mock.calls[0];
    expect(radius).toBeCloseTo(markerRadius(1));
    expect(x).toBeCloseTo(SIZE / 2, 0);
    expect(y).toBeCloseTo(SIZE / 2, 0);
  });

  test("opens facing the busiest country, and a tie goes to the code that sorts first", () => {
    const busiest = mount({ rows: rowsFor(["US", 10], ["GB", 100]) });
    busiest.move(SIZE / 2, SIZE / 2);
    expect(busiest.onHighlight).toHaveBeenLastCalledWith("GB");
    busiest.unmount();

    const tied = mount({ rows: rowsFor(["US", 50], ["GB", 50]) });
    tied.move(SIZE / 2, SIZE / 2);
    expect(tied.onHighlight).toHaveBeenLastCalledWith("GB");
  });

  test("hovering a country with data highlights it and shows its name and numbers", () => {
    const { move, onHighlight } = mount();
    const [x, y] = pixelFor("GB", "GB");

    move(x, y);

    expect(onHighlight).toHaveBeenLastCalledWith("GB");
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    expect(screen.getByText(/100 views · 33 visitors/)).toBeInTheDocument();
  });

  test("hovering a country with no data highlights nothing and shows no tooltip", () => {
    const { move, onHighlight } = mount({ rows: rowsFor(["GB", 100]) });
    const [x, y] = pixelFor("IE", "GB");

    move(x, y);

    expect(onHighlight).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/views ·/)).not.toBeInTheDocument();
  });

  test("hovering the empty corner outside the sphere highlights nothing, even where a country would lie beneath", () => {
    // With the globe facing Britain, the bottom-left corner of the square inverts to somewhere in Brazil.
    const { move, onHighlight } = mount({ rows: rowsFor(["GB", 100], ["BR", 90]) });

    move(2, SIZE - 2);

    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  test("hovering a small-state dot works like hovering a shape", () => {
    const { move, onHighlight } = mount({ rows: rowsFor(["SG", 40], ["GB", 10]) });

    move(SIZE / 2 + 3, SIZE / 2 - 2);

    expect(onHighlight).toHaveBeenLastCalledWith("SG");
  });

  test("a highlighted small state is outlined more heavily than an ordinary one", () => {
    const { rerenderWith, clock } = mount({ rows: rowsFor(["SG", 40]) });
    const ordinary = Math.max(...drawing.lineWidths);

    rerenderWith({ highlighted: "SG" });
    drawing.lineWidths.length = 0;
    clock.frame();

    expect(Math.max(...drawing.lineWidths)).toBeGreaterThan(ordinary);
  });

  test("leaving the globe clears the highlight and the tooltip", () => {
    const { move, leave, onHighlight } = mount();
    const [x, y] = pixelFor("GB", "GB");
    move(x, y);

    leave();

    expect(onHighlight).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/views ·/)).not.toBeInTheDocument();
  });

  describe("dragging", () => {
    test("turns the globe, lets go of the highlight at the press, and leaves it alone while dragging", () => {
      const { down, move, up, onHighlight, clock } = mount();
      const [x, y] = pixelFor("GB", "GB");
      move(x, y);
      const before = pictureOf(clock);

      down(x, y);
      expect(onHighlight).toHaveBeenLastCalledWith(null);
      onHighlight.mockClear();
      move(x + 60, y);
      move(x + 120, y + 10);
      const after = pictureOf(clock);
      up();

      expect(onHighlight).not.toHaveBeenCalled();
      expect(screen.queryByText(/views ·/)).not.toBeInTheDocument();
      expect(after).not.toEqual(before);
    });

    test("a second finger is not part of the drag, and can't make it jump", () => {
      const { down, move, clock } = mount();
      down(200, 200, { id: 1, pointerType: "touch" });
      down(50, 50, { id: 2, pointerType: "touch" });

      drawing.context.moveTo.mockClear();
      move(60, 60, { id: 2, pointerType: "touch" });
      clock.frame();
      expect(drawing.context.moveTo).not.toHaveBeenCalled();

      move(230, 200, { id: 1, pointerType: "touch" });
      clock.frame();
      expect(drawing.context.moveTo).toHaveBeenCalled();
    });

    test("lifting the second finger doesn't end the first finger's drag", () => {
      const { down, move, up, clock } = mount();
      down(200, 200, { id: 1, pointerType: "touch" });
      down(50, 50, { id: 2, pointerType: "touch" });

      up({ id: 2, pointerType: "touch" });
      drawing.context.moveTo.mockClear();
      move(240, 200, { id: 1, pointerType: "touch" });
      clock.frame();

      expect(drawing.context.moveTo).toHaveBeenCalled();
    });

    test("a right click doesn't start a drag", () => {
      const { down, move, onHighlight } = mount();
      const [x, y] = pixelFor("GB", "GB");

      down(x, y, { button: 2 });
      move(x, y);

      expect(onHighlight).toHaveBeenLastCalledWith("GB");
    });

    test("a flick keeps coasting after release", () => {
      const { down, move, up, clock } = mount();
      down(200, 200);
      clock.wait(16);
      move(260, 200);
      up();

      expect(moved(clock)).toBe(true);
      clock.run(200);
      expect(moved(clock)).toBe(true);
    });

    test("holding still before letting go doesn't fling", () => {
      const { down, move, up, clock } = mount();
      down(200, 200);
      clock.wait(16);
      move(260, 200);
      clock.wait(STALE_FLING_MS + 200);
      up();

      expect(moved(clock)).toBe(false);
    });

    test("with reduced motion it stops the moment you let go", () => {
      const { down, move, up, clock } = mount({ reduced: true });
      down(200, 200);
      clock.wait(16);
      move(260, 200);
      up();

      expect(moved(clock)).toBe(false);
    });
  });

  describe("turning to a country", () => {
    test("turns to a country when asked, and asking for the same country again turns back to it", () => {
      const { rerenderWith, clock, move, down, up, onHighlight } = mount({ rows: rowsFor(["GB", 100], ["JP", 60]) });

      rerenderWith({ focus: { code: "JP" } });
      clock.run(1200);
      move(SIZE / 2, SIZE / 2);
      expect(onHighlight).toHaveBeenLastCalledWith("JP");

      // Drag it well away, then ask for JP again with a new request.
      down(100, 200);
      clock.wait(16);
      move(300, 200);
      clock.wait(STALE_FLING_MS + 50);
      up();
      move(SIZE / 2, SIZE / 2);
      expect(onHighlight).toHaveBeenLastCalledWith(null);

      rerenderWith({ focus: { code: "JP" } });
      clock.run(1200);
      move(SIZE / 2, SIZE / 2);
      expect(onHighlight).toHaveBeenLastCalledWith("JP");
    });

    test("ignores a request for a code it has no centre for", () => {
      const { rerenderWith, clock } = mount();
      clock.frame();

      rerenderWith({ focus: { code: "ZZ" } });

      // Nothing turns, so there is nothing to redraw.
      expect(moved(clock)).toBe(false);
    });

    test("is instant with reduced motion", () => {
      const { rerenderWith, clock, move, onHighlight } = mount({ reduced: true, rows: rowsFor(["GB", 100], ["JP", 60]) });

      rerenderWith({ focus: { code: "JP" } });
      clock.frame();
      move(SIZE / 2, SIZE / 2);

      expect(onHighlight).toHaveBeenLastCalledWith("JP");
    });
  });

  test("outlines the highlighted country brightly, and only that one", () => {
    const { rerenderWith, clock } = mount();
    expect(drawing.strokes).not.toContain(GLOBE_COLORS.ink);

    rerenderWith({ highlighted: "GB" });
    clock.frame();
    expect(drawing.strokes.filter((colour) => colour === GLOBE_COLORS.ink)).toHaveLength(1);

    drawing.strokes.length = 0;
    rerenderWith({ highlighted: "US" });
    clock.frame();
    expect(drawing.strokes.filter((colour) => colour === GLOBE_COLORS.ink)).toHaveLength(1);
  });

  test("does not outline a highlighted country that has no data", () => {
    const { rerenderWith, clock } = mount({ rows: rowsFor(["GB", 100]) });
    drawing.strokes.length = 0;

    rerenderWith({ highlighted: "FR" });
    clock.frame();

    expect(drawing.strokes).not.toContain(GLOBE_COLORS.ink);
  });

  test("new rows repaint the map without turning the globe away from where it was", () => {
    const { rerenderWith, clock, move, onHighlight } = mount({ rows: rowsFor(["GB", 100]) });
    expect(drawing.fills).not.toContain(heatColor(0.72));

    rerenderWith({ rows: rowsFor(["GB", 100], ["FR", 100]) });
    drawing.fills.length = 0;
    clock.frame();

    expect(drawing.fills.filter((colour) => colour === heatColor(1)).length).toBeGreaterThan(0);
    move(...pixelFor("GB", "GB"));
    expect(onHighlight).toHaveBeenLastCalledWith("GB");
  });

  describe("turning by itself", () => {
    test("waits for the idle time counted from when the globe appeared, however long the page had been open", () => {
      const { clock } = mount({ startAt: 120_000 });

      clock.run(IDLE_BEFORE_ROTATING_MS - 400);
      expect(moved(clock)).toBe(false);

      clock.run(800);
      expect(moved(clock)).toBe(true);
    });

    test("never happens with reduced motion", () => {
      const { clock } = mount({ reduced: true });

      clock.run(9000);

      expect(moved(clock)).toBe(false);
    });

    test("follows the Reduce Motion setting while the page is open", () => {
      const { motion, clock } = mount();

      clock.run(5000);
      motion.change(true);

      expect(moved(clock)).toBe(false);
    });
  });

  test("redraws at the new size when the container changes size", () => {
    const { canvas, clock } = mount();
    expect(canvas.width).toBe(SIZE);

    currentWidth = 300;
    act(() => observerCallbacks.forEach((callback) => callback()));
    drawing.context.clearRect.mockClear();
    clock.frame();

    expect(canvas.width).toBe(300);
    expect(drawing.context.clearRect).toHaveBeenCalled();
  });

  test("describes itself to a screen reader, and says what it leaves out", () => {
    mount({ rows: rowsFor(["GB", 100]) });

    expect(screen.getByRole("img", { name: /Busiest: United Kingdom, 100/ })).toBeInTheDocument();
    expect(screen.getByText(/Countries with too few visits are folded into/)).toBeInTheDocument();
    expect(screen.getByText("Most: 100")).toBeInTheDocument();
  });

  test("with nothing to show it says so instead of inventing a scale", () => {
    mount({ rows: [] });

    expect(screen.getByRole("img", { name: /No countries to show yet/ })).toBeInTheDocument();
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  test("stops responding, and stops its frame loop, when it goes away", () => {
    const { unmount, clock, canvas, onHighlight } = mount();
    const [x, y] = pixelFor("GB", "GB");

    unmount();
    act(() => void canvas.dispatchEvent(pointerEvent("pointermove", { x, y })));

    expect(onHighlight).not.toHaveBeenCalled();
    expect(clock.cancel).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  test("does nothing, and doesn't throw, where a canvas has no 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    stubClock();
    stubReducedMotion(false);

    expect(() => render(<TrafficGlobe rows={rowsFor(["GB", 10])} highlighted={null} onHighlight={vi.fn()} focus={null} />)).not.toThrow();
  });
});
