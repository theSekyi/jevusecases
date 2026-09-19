import { geoGraticule10, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { codeForShape } from "@/lib/globe";

export interface CountryShape {
  /** Two-letter code, or null for a shape with no country behind it (such as Somaliland). */
  code: string | null;
  feature: Feature<Geometry, { name?: string }>;
}

const topology = world as unknown as Topology;

/** Every country the 110 m map draws, with its two-letter code. Built once, when the globe first loads. */
export const COUNTRY_SHAPES: CountryShape[] = (
  feature(topology, topology.objects.countries as GeometryCollection<{ name?: string }>) as unknown as {
    features: Feature<Geometry, { name?: string }>[];
  }
).features.map((shape) => ({ code: codeForShape(shape.id as string | undefined, shape.properties?.name), feature: shape }));

/** The shape for a country code, for looking one up without searching every frame. */
export const SHAPE_BY_CODE = new Map(COUNTRY_SHAPES.flatMap((shape) => (shape.code ? [[shape.code, shape] as const] : [])));

/** Faint latitude and longitude lines every ten degrees. */
export const GRATICULE: GeoPermissibleObjects = geoGraticule10();
