import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { geoOrthographic } from "d3-geo";
import { TrafficGlobe, type GlobeFocus } from "../admin/TrafficGlobe";
import { centreOf, heatColor, rotationFor } from "@/lib/globe";
import { COUNTRY_SHAPES } from "@/lib/globeShapes";
import type { TrafficRow } from "@/lib/trafficStats";

const SIZE = 400;
const LAND = "#1c222a";

function fakeContext() {
  const fills: string[] = [];
  const strokes: string[] = [];
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
    lineWidth: 1,
  };
  Object.defineProperty(context, "fillStyle", { set: (value: string) => fills.push(value), get: () => fills.at(-1) });
  Object.defineProperty(context, "strokeStyle", { set: (value: string) => strokes.push(value), get: () => strokes.at(-1) });
  return { context, fills, strokes };
}

function stubClock() {
  let now = 0;
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
    run(ms: number, step = 50) {
      for (let elapsed = 0; elapsed < ms; elapsed += step) this.frame(step);
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
  return { query, listeners, change: (next: boolean) => { query.matches = next; act(() => listeners.forEach((listener) => listener())); } };
}

const disconnect = vi.fn();

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

describe("TrafficGlobe", () => {
  let drawing: ReturnType<typeof fakeContext>;

  beforeEach(() => {
    drawing = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(drawing.context as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => SIZE });
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLCanvasElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLCanvasElement.prototype, "hasPointerCapture", { configurable: true, value: vi.fn().mockReturnValue(true) });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    disconnect.mockClear();
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount({
    rows = rowsFor(["GB", 100], ["US", 40]),
    reduced = false,
    highlighted = null as string | null,
    focus = null as GlobeFocus | null,
  } = {}) {
    const clock = stubClock();
    const motion = stubReducedMotion(reduced);
    const onHighlight = vi.fn();
    const view = render(<TrafficGlobe rows={rows} highlighted={highlighted} onHighlight={onHighlight} focus={focus} />);
    const canvas = view.container.querySelector("canvas")!;
    const move = (x: number, y: number) => act(() => void canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true })));
    const down = (x: number, y: number) => act(() => void canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true })));
    const up = () => act(() => void canvas.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    const leave = () => act(() => void canvas.dispatchEvent(new MouseEvent("pointerleave", { bubbles: true })));
    clock.frame();
    return { ...view, clock, motion, onHighlight, canvas, move, down, up, leave, rerenderWith: (props: Partial<{ rows: TrafficRow[]; highlighted: string | null; focus: GlobeFocus | null }>) => view.rerender(<TrafficGlobe rows={props.rows ?? rows} highlighted={props.highlighted ?? highlighted} onHighlight={onHighlight} focus={props.focus ?? focus} />) };
  }

  test("draws the sphere, every country shape and the rim", () => {
    mount();

    expect(drawing.context.clearRect).toHaveBeenCalled();
    expect(drawing.context.fill.mock.calls.length).toBeGreaterThanOrEqual(COUNTRY_SHAPES.length + 1);
    expect(drawing.context.stroke.mock.calls.length).toBeGreaterThan(COUNTRY_SHAPES.length);
  });

  test("colours a country by its heat, and leaves every other country the plain land colour", () => {
    mount({ rows: rowsFor(["GB", 100], ["US", 25]) });

    expect(drawing.fills).toContain(heatColor(1));
    expect(drawing.fills).toContain(LAND);
    const heatColours = new Set(drawing.fills.filter((colour) => colour !== LAND && colour !== "#0f1319"));
    expect(heatColours.size).toBe(2);
  });

  test("draws nothing for countries the list folded into Other or Unknown", () => {
    mount({ rows: [{ kind: "other", views: 40, visitors: 9 }, { kind: "unknown", views: 12, visitors: 3 }] });

    const heatColours = drawing.fills.filter((colour) => colour !== LAND && colour !== "#0f1319");
    expect(heatColours).toEqual([]);
    expect(drawing.context.arc).not.toHaveBeenCalled();
  });

  test("marks a small state that has no shape with a dot at its centre, sized by heat", () => {
    mount({ rows: rowsFor(["SG", 40]) });

    expect(drawing.context.arc).toHaveBeenCalledTimes(1);
    const [x, y, radius] = drawing.context.arc.mock.calls[0];
    expect(radius).toBeCloseTo(6.5);
    expect(x).toBeCloseTo(SIZE / 2, 0);
    expect(y).toBeCloseTo(SIZE / 2, 0);
  });

  test("opens facing the busiest country", () => {
    const { onHighlight, move } = mount({ rows: rowsFor(["US", 10], ["GB", 100]) });

    move(SIZE / 2, SIZE / 2);

    expect(onHighlight).toHaveBeenLastCalledWith("GB");
  });

  test("hovering a country with data highlights it and shows its name and numbers", () => {
    const { move } = mount();
    const [x, y] = pixelFor("GB", "GB");

    move(x, y);

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

  test("hovering empty space around the sphere highlights nothing", () => {
    const { move, onHighlight } = mount();

    move(2, 2);

    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  test("hovering a small-state dot works like hovering a shape", () => {
    const { move, onHighlight } = mount({ rows: rowsFor(["SG", 40], ["GB", 10]) });

    move(SIZE / 2 + 3, SIZE / 2 - 2);

    expect(onHighlight).toHaveBeenLastCalledWith("SG");
  });

  test("leaving the globe clears the highlight and the tooltip", () => {
    const { move, leave, onHighlight } = mount();
    const [x, y] = pixelFor("GB", "GB");
    move(x, y);

    leave();

    expect(onHighlight).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/views ·/)).not.toBeInTheDocument();
  });

  test("dragging turns the globe, and the highlight is left alone while it turns", () => {
    const { down, move, up, onHighlight, clock } = mount();
    const picture = () => JSON.stringify(drawing.context.moveTo.mock.calls.slice(0, 40));
    const before = picture();
    onHighlight.mockClear();
    drawing.context.moveTo.mockClear();

    down(200, 200);
    move(260, 200);
    move(320, 210);
    clock.frame();
    up();

    expect(onHighlight).not.toHaveBeenCalled();
    expect(picture()).not.toEqual(before);
  });

  test("keeps turning for a moment after a drag is let go, then settles", () => {
    const { down, move, up, clock } = mount({ reduced: true });
    down(200, 200);
    move(280, 200);
    up();

    drawing.context.moveTo.mockClear();
    clock.frame();
    expect(drawing.context.moveTo).toHaveBeenCalled();

    clock.run(4000, 16);
    drawing.context.moveTo.mockClear();
    clock.frame();
    expect(drawing.context.moveTo).not.toHaveBeenCalled();
  });

  test("turns to a country when asked, and asking the same country again turns again", () => {
    const { rerenderWith, clock, move, onHighlight } = mount({ rows: rowsFor(["GB", 100], ["JP", 60]) });

    rerenderWith({ focus: { code: "JP", nonce: 1 } });
    clock.run(1200);
    move(SIZE / 2, SIZE / 2);
    expect(onHighlight).toHaveBeenLastCalledWith("JP");

    rerenderWith({ focus: { code: "GB", nonce: 2 } });
    clock.run(1200);
    move(SIZE / 2, SIZE / 2);
    expect(onHighlight).toHaveBeenLastCalledWith("GB");
  });

  test("outlines the highlighted country brightly, and only that one", () => {
    const { rerenderWith, clock } = mount();
    expect(drawing.strokes).not.toContain("#eff2f5");

    rerenderWith({ highlighted: "GB" });
    clock.frame();
    expect(drawing.strokes.filter((colour) => colour === "#eff2f5")).toHaveLength(1);

    drawing.strokes.length = 0;
    rerenderWith({ highlighted: "US" });
    clock.frame();
    expect(drawing.strokes.filter((colour) => colour === "#eff2f5")).toHaveLength(1);
  });

  test("does not outline a highlighted country that has no data", () => {
    const { rerenderWith, clock } = mount({ rows: rowsFor(["GB", 100]) });
    drawing.strokes.length = 0;

    rerenderWith({ highlighted: "FR" });
    clock.frame();

    expect(drawing.strokes).not.toContain("#eff2f5");
  });

  test("rotates on its own once nobody has touched it for a few seconds, but not before", () => {
    const { clock } = mount();
    const moved = () => {
      drawing.context.moveTo.mockClear();
      clock.frame();
      return drawing.context.moveTo.mock.calls.length > 0;
    };

    clock.run(1000);
    expect(moved()).toBe(false);

    clock.run(3500);
    expect(moved()).toBe(true);
  });

  test("with reduced motion it never rotates on its own, and a requested turn is instant", () => {
    const { clock, rerenderWith, move, onHighlight } = mount({ reduced: true, rows: rowsFor(["GB", 100], ["JP", 60]) });

    clock.run(9000);
    drawing.context.moveTo.mockClear();
    clock.frame();
    expect(drawing.context.moveTo).not.toHaveBeenCalled();

    rerenderWith({ focus: { code: "JP", nonce: 1 } });
    clock.frame();
    move(SIZE / 2, SIZE / 2);
    expect(onHighlight).toHaveBeenLastCalledWith("JP");
  });

  test("follows the Reduce Motion setting while the page is open", () => {
    const { motion, clock } = mount();

    clock.run(5000);
    motion.change(true);
    drawing.context.moveTo.mockClear();
    clock.run(3000);

    expect(drawing.context.moveTo).not.toHaveBeenCalled();
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

  test("removes its listeners and stops the frame loop when it goes away", () => {
    const { unmount, clock } = mount();

    unmount();

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
