// Real district boundaries (from OSM, via /public/almaty-districts.geojson) and
// a point-in-polygon lookup. Replaces "nearest district center" matching, which
// misassigns points near a border since districts are irregular shapes, not
// circles around one coordinate.

export interface DistrictFeature {
  type: 'Feature';
  properties: { id: string; name: string; nameEn: string };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface DistrictGeoJSON {
  type: 'FeatureCollection';
  features: DistrictFeature[];
}

type LngLat = [number, number];

// Ray-casting test for one ring. Ring is a closed [lng, lat][] loop.
function pointInRing(point: LngLat, ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as LngLat;
    const [xj, yj] = ring[j] as LngLat;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

// A GeoJSON Polygon's rings: [0] is the outer boundary, [1..] are holes.
function pointInPolygon(point: LngLat, rings: number[][][]): boolean {
  if (!pointInRing(point, rings[0]!)) return false;
  for (let k = 1; k < rings.length; k++) {
    if (pointInRing(point, rings[k]!)) return false;
  }
  return true;
}

function pointInMultiPolygon(point: LngLat, polygons: number[][][][]): boolean {
  return polygons.some((rings) => pointInPolygon(point, rings));
}

let cached: Promise<DistrictGeoJSON> | null = null;

// Fetched once and reused across every caller (Hero's locate button, the map).
export function loadDistrictBoundaries(): Promise<DistrictGeoJSON> {
  if (!cached) {
    cached = fetch('/almaty-districts.geojson').then((r) => r.json() as Promise<DistrictGeoJSON>);
  }
  return cached;
}

// Returns the district id whose polygon contains (lat, lng), or null if the
// point falls outside every known district (e.g. outside Almaty entirely).
export function findDistrictId(lat: number, lng: number, geo: DistrictGeoJSON): string | null {
  const p: LngLat = [lng, lat];
  for (const f of geo.features) {
    if (pointInMultiPolygon(p, f.geometry.coordinates)) return f.properties.id;
  }
  return null;
}
