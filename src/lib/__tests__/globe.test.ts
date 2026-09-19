import { describe, expect, test } from "vitest";
import {
  MAX_TILT,
  centreOf,
  clampTilt,
  codeForShape,
  hasShape,
  heatByCountry,
  heatColor,
  heatFraction,
  heatGradient,
  rotationFor,
  shortestTurn,
} from "../globe";
import type { TrafficRow } from "../trafficStats";

const rows: TrafficRow[] = [
  { kind: "country", country: "GB", views: 100, visitors: 20 },
  { kind: "country", country: "US", views: 25, visitors: 8 },
  { kind: "country", country: "SG", views: 4, visitors: 3 },
  { kind: "unknown", views: 9, visitors: 4 },
  { kind: "other", views: 7, visitors: 5 },
];

describe("codeForShape", () => {
  test("maps the map's numeric ids to two-letter codes", () => {
    expect(codeForShape("826", "United Kingdom")).toBe("GB");
    expect(codeForShape("250", "France")).toBe("FR");
    expect(codeForShape(578, "Norway")).toBe("NO");
  });

  test("knows Kosovo, which the map draws without an ISO number", () => {
    expect(codeForShape(undefined, "Kosovo")).toBe("XK");
  });

  test("gives nothing for a shape with no country behind it", () => {
    expect(codeForShape(undefined, "Somaliland")).toBeNull();
    expect(codeForShape("999999", "Nowhere")).toBeNull();
    expect(codeForShape(undefined, undefined)).toBeNull();
  });
});

describe("centreOf / hasShape", () => {
  test("has a centre for countries with and without a shape, in either case", () => {
    expect(centreOf("GB")).toEqual([expect.any(Number), expect.any(Number)]);
    expect(centreOf("sg")).toEqual([1.4, 103.8]);
    expect(centreOf("ZZ")).toBeNull();
  });

  test("tells big countries, which have a shape, from small states, which only have a centre", () => {
    expect(hasShape("US")).toBe(true);
    expect(hasShape("gb")).toBe(true);
    expect(hasShape("SG")).toBe(false);
    expect(hasShape("MT")).toBe(false);
    expect(hasShape("ZZ")).toBe(false);
  });
});

describe("heatFraction", () => {
  test("is 1 for the busiest country and never below the floor for one with data", () => {
    expect(heatFraction(100, 100)).toBe(1);
    expect(heatFraction(1, 10_000)).toBeGreaterThan(0.18);
    expect(heatFraction(1, 10_000)).toBeLessThan(0.3);
  });

  test("uses a square-root scale, so a quarter of the views is half the way up", () => {
    const quarter = heatFraction(25, 100);
    const halfWay = 0.18 + (1 - 0.18) * 0.5;
    expect(quarter).toBeCloseTo(halfWay);
  });

  test("is 0 for no views or no maximum, and caps at 1 for more than the maximum", () => {
    expect(heatFraction(0, 100)).toBe(0);
    expect(heatFraction(5, 0)).toBe(0);
    expect(heatFraction(200, 100)).toBe(1);
  });

  test("never falls as views rise", () => {
    let previous = 0;
    for (let views = 1; views <= 100; views++) {
      const value = heatFraction(views, 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("heatByCountry", () => {
  const heat = heatByCountry(rows);

  test("has only the countries the list names, with their counts", () => {
    expect([...heat.keys()].sort()).toEqual(["GB", "SG", "US"]);
    expect(heat.get("US")).toMatchObject({ views: 25, visitors: 8 });
  });

  test("leaves out unknown and folded rows, so nothing about them can reach the globe", () => {
    expect(JSON.stringify([...heat.values()])).not.toContain("other");
    expect(heat.size).toBe(3);
  });

  test("scales against the busiest named country", () => {
    expect(heat.get("GB")!.heat).toBe(1);
    expect(heat.get("US")!.heat).toBeLessThan(1);
    expect(heat.get("SG")!.heat).toBeLessThan(heat.get("US")!.heat);
  });

  test("is empty for an empty summary", () => {
    expect(heatByCountry([]).size).toBe(0);
    expect(heatByCountry([{ kind: "other", views: 9, visitors: 2 }]).size).toBe(0);
  });
});

describe("heatColor", () => {
  test("is a valid hex colour along the whole ramp", () => {
    for (let heat = -0.5; heat <= 1.5; heat += 0.05) {
      expect(heatColor(heat)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("starts dim, passes through the site's orange, and ends light", () => {
    expect(heatColor(0)).toBe("#5a3324");
    expect(heatColor(0.72)).toBe("#fe843d");
    expect(heatColor(1)).toBe("#ffc99a");
  });

  test("gets brighter as heat rises", () => {
    const brightness = (color: string) => parseInt(color.slice(1, 3), 16) + parseInt(color.slice(3, 5), 16) + parseInt(color.slice(5, 7), 16);
    let previous = 0;
    for (let heat = 0; heat <= 1; heat += 0.05) {
      const value = brightness(heatColor(heat));
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  test("clamps values outside 0 to 1", () => {
    expect(heatColor(-3)).toBe(heatColor(0));
    expect(heatColor(9)).toBe(heatColor(1));
  });

  test("the legend gradient uses the same colours as the globe", () => {
    const gradient = heatGradient();
    expect(gradient).toContain(heatColor(0));
    expect(gradient).toContain(heatColor(1));
    expect(gradient.startsWith("linear-gradient(to right")).toBe(true);
  });
});

describe("rotationFor / shortestTurn / clampTilt", () => {
  test("puts a country at the middle of the view by rotating the opposite way", () => {
    expect(rotationFor([51.5, -0.1])).toEqual([0.1, -51.5]);
    expect(rotationFor([-33, 151])).toEqual([-151, 33]);
  });

  test("turns the short way round, never through more than half a circle", () => {
    expect(shortestTurn(10, 30)).toBe(20);
    expect(shortestTurn(350, 10)).toBe(20);
    expect(shortestTurn(10, 350)).toBe(-20);
    expect(shortestTurn(0, 180)).toBe(-180);
    for (let from = -720; from <= 720; from += 37) {
      for (let to = -720; to <= 720; to += 41) {
        const turn = shortestTurn(from, to);
        expect(Math.abs(turn)).toBeLessThanOrEqual(180);
        expect((((from + turn - to) % 360) + 360) % 360).toBeCloseTo(0, 6);
      }
    }
  });

  test("keeps the tilt off the poles", () => {
    expect(clampTilt(90)).toBe(MAX_TILT);
    expect(clampTilt(-90)).toBe(-MAX_TILT);
    expect(clampTilt(20)).toBe(20);
  });
});
