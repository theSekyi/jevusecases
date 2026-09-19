import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Run by hand when world-atlas or world-countries is updated:  node scripts/generate-globe-data.ts
// The globe draws country shapes from world-atlas, which knows countries by their numeric ISO code, while the
// site's visit data uses two-letter codes. This writes the small lookup between them, plus every country's
// centre, so the globe can also mark countries too small to have a shape at this map resolution.

const require = createRequire(import.meta.url);
const topology = require("world-atlas/countries-110m.json");
const countries = require("world-countries") as { cca2: string; ccn3: string; latlng: [number, number] }[];

/** Shapes the atlas draws without an ISO number. Kosovo is the only one that visitors can be geolocated to. */
const BY_NAME: Record<string, string> = { Kosovo: "XK" };

const alpha2ByNumber = new Map(countries.map((country) => [country.ccn3, country.cca2]));

const numeric: Record<string, string> = {};
for (const shape of topology.objects.countries.geometries as { id?: string; properties: { name: string } }[]) {
  const code = (shape.id && alpha2ByNumber.get(shape.id)) || BY_NAME[shape.properties.name];
  if (code && shape.id) numeric[shape.id] = code;
  else if (code) numeric[`name:${shape.properties.name}`] = code;
}

const centres: Record<string, [number, number]> = {};
for (const country of countries) {
  if (country.latlng?.length === 2) centres[country.cca2] = [round(country.latlng[0]), round(country.latlng[1])];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const sorted = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
const output = join(import.meta.dirname, "../src/data/globe-countries.json");
writeFileSync(output, `${JSON.stringify({ numeric: sorted(numeric), centres: sorted(centres) })}\n`);
console.log(`Wrote ${Object.keys(numeric).length} shape codes and ${Object.keys(centres).length} centres.`);
