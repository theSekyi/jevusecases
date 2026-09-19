import { describe, expect, test } from "vitest";
import { COUNTRY_SHAPES, SHAPE_BY_CODE } from "../globeShapes";

describe("COUNTRY_SHAPES", () => {
  test("gives every shape a country code except the two the map draws without one", () => {
    const withoutCode = COUNTRY_SHAPES.filter((shape) => shape.code === null).map((shape) => shape.feature.properties?.name);

    expect(withoutCode.sort()).toEqual(["N. Cyprus", "Somaliland"]);
  });

  test("has about a hundred and seventy countries, with no code used twice", () => {
    const codes = COUNTRY_SHAPES.flatMap((shape) => (shape.code ? [shape.code] : []));

    expect(codes.length).toBeGreaterThan(170);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("finds a country's shape by its code", () => {
    expect(SHAPE_BY_CODE.get("GB")?.feature.properties?.name).toBe("United Kingdom");
    expect(SHAPE_BY_CODE.get("XK")?.feature.properties?.name).toBe("Kosovo");
    expect(SHAPE_BY_CODE.get("SG")).toBeUndefined();
  });
});
