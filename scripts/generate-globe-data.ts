import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Run by hand when world-atlas or world-countries is updated:  npm run globe:data
// The globe draws country shapes from world-atlas, which knows countries by their numeric ISO code, while the
// site's visit data uses two-letter codes. This writes the small lookup between them, plus every country's
// centre, so the globe can also mark countries too small to have a shape at this map resolution.

export interface Topology {
  objects: { countries: { geometries: { id?: string; properties: { name: string } }[] } };
}
export interface CountryRecord {
  cca2: string;
  ccn3: string;
  latlng: [number, number];
}

export interface GlobeData {
  /** Numeric ISO code (as world-atlas writes it) to two-letter code. */
  numeric: Record<string, string>;
  /** Shapes the atlas draws without an ISO number, by the name it gives them. */
  names: Record<string, string>;
  /** [latitude, longitude], to 0.1 degree, for every country. */
  centres: Record<string, [number, number]>;
}

/** Shapes the atlas draws without an ISO number. Kosovo is the only one visitors can be geolocated to. */
const BY_NAME: Record<string, string> = { Kosovo: "XK" };

const round = (value: number) => Math.round(value * 10) / 10;
const sortedByKey = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export function buildGlobeData(topology: Topology, countries: CountryRecord[]): GlobeData {
  const alpha2ByNumber = new Map(countries.map((country) => [country.ccn3, country.cca2]));

  const numeric: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const shape of topology.objects.countries.geometries) {
    const byNumber = shape.id ? alpha2ByNumber.get(shape.id) : undefined;
    if (byNumber && shape.id) numeric[shape.id] = byNumber;
    else if (BY_NAME[shape.properties.name]) names[shape.properties.name] = BY_NAME[shape.properties.name];
  }

  const centres: Record<string, [number, number]> = {};
  for (const country of countries) {
    if (country.latlng?.length === 2) centres[country.cca2] = [round(country.latlng[0]), round(country.latlng[1])];
  }

  return { numeric: sortedByKey(numeric), names: sortedByKey(names), centres: sortedByKey(centres) };
}

if (process.argv[1] === import.meta.filename) {
  const require = createRequire(import.meta.url);
  const data = buildGlobeData(require("world-atlas/countries-110m.json"), require("world-countries"));
  writeFileSync(join(import.meta.dirname, "../src/data/globe-countries.json"), `${JSON.stringify(data)}\n`);
  console.log(`Wrote ${Object.keys(data.numeric).length} shape codes and ${Object.keys(data.centres).length} centres.`);
}
