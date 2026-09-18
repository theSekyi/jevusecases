import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { GeometricField } from "../GeometricField";

function fakeContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    lineWidth: 1,
    strokeStyle: "",
    fillStyle: "",
    globalAlpha: 1,
  };
}

function stubEnvironment({ reducedMotion, context }: { reducedMotion: boolean; context: ReturnType<typeof fakeContext> | null }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D | null);
}

describe("GeometricField", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("is a decorative canvas that can't take clicks or be read by a screen reader", () => {
    stubEnvironment({ reducedMotion: false, context: fakeContext() });
    const { container } = render(<GeometricField />);

    const canvas = container.querySelector("canvas")!;
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none", "fixed", "-z-10");
  });

  test("draws the lattice: lines for the edges and dots for the vertices", () => {
    const context = fakeContext();
    stubEnvironment({ reducedMotion: false, context });

    render(<GeometricField />);

    expect(context.moveTo.mock.calls.length).toBeGreaterThan(100);
    expect(context.moveTo.mock.calls.length).toBe(context.lineTo.mock.calls.length);
    expect(context.arc.mock.calls.length).toBeGreaterThan(50);
    expect(context.globalAlpha).toBe(1);
  });

  test("animates and follows the pointer, and stops listening when it goes away", () => {
    stubEnvironment({ reducedMotion: false, context: fakeContext() });
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<GeometricField />);

    expect(add).toHaveBeenCalledWith("pointermove", expect.any(Function), { passive: true });
    expect(add).toHaveBeenCalledWith("pointerdown", expect.any(Function), { passive: true });
    expect(requestAnimationFrame).toHaveBeenCalled();

    unmount();

    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  test("with reduced motion it draws one still frame and never animates or follows the pointer", () => {
    const context = fakeContext();
    stubEnvironment({ reducedMotion: true, context });
    const add = vi.spyOn(window, "addEventListener");

    render(<GeometricField />);

    expect(context.arc.mock.calls.length).toBeGreaterThan(50);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalledWith("pointermove", expect.anything(), expect.anything());
  });

  test("does nothing, and doesn't throw, where a canvas has no 2D context", () => {
    stubEnvironment({ reducedMotion: false, context: null });

    expect(() => render(<GeometricField />)).not.toThrow();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
