import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { buildGlobeData, type CountryRecord, type Topology } from "../generate-globe-data";

const topology: Topology = {
  objects: {
    countries: {
      geometries: [
        { id: "250", properties: { name: "France" } },
        { id: "826", properties: { name: "United Kingdom" } },
        { properties: { name: "Kosovo" } },
        { properties: { name: "Somaliland" } },
      ],
    },
  },
};
const countries: CountryRecord[] = [
  { cca2: "FR", ccn3: "250", latlng: [46.04, 2.06] },
  { cca2: "GB", ccn3: "826", latlng: [54.23, -2.01] },
  { cca2: "SG", ccn3: "702", latlng: [1.36, 103.82] },
  { cca2: "XK", ccn3: "", latlng: [42.66, 21.16] },
];

describe("buildGlobeData", () => {
  const data = buildGlobeData(topology, countries);

  test("maps each shape's numeric id to its two-letter code", () => {
    expect(data.numeric).toEqual({ "250": "FR", "826": "GB" });
  });

  test("maps Kosovo by name, and leaves out a shape it can't place", () => {
    expect(data.names).toEqual({ Kosovo: "XK" });
    expect(JSON.stringify(data)).not.toContain("Somaliland");
  });

  test("records every country's centre to a tenth of a degree, including ones with no shape", () => {
    expect(data.centres.SG).toEqual([1.4, 103.8]);
    expect(data.centres.GB).toEqual([54.2, -2]);
    expect(Object.keys(data.centres)).toHaveLength(4);
  });

  test("is sorted, so regenerating gives the same file every time", () => {
    expect(Object.keys(data.centres)).toEqual(["FR", "GB", "SG", "XK"]);
    expect(JSON.stringify(buildGlobeData(topology, [...countries].reverse()))).toBe(JSON.stringify(data));
  });

  test("the committed data is what the generator makes from the real map and country list", () => {
    const require = createRequire(import.meta.url);
    const fresh = buildGlobeData(require("world-atlas/countries-110m.json"), require("world-countries"));

    expect(fresh).toEqual(require("../../src/data/globe-countries.json"));
  });
});
