// Station placement optimizer — cover the most people with the fewest MQ
// stations (greedy weighted set-cover).
//
// City = grid of cells, each weighted by population density (approximated by
// district weights). A station at candidate site covers every cell within
// EFFECTIVE_RADIUS_KM (the Gaussian fusion length scale × ~1.6, where the
// kernel still retains ≥25% weight). Greedy: repeatedly place the station
// that adds the most uncovered population weight. Greedy set-cover is
// (1 − 1/e)-optimal ≈ 63% guarantee — the standard justification.
//
// Returns placements + coverage curve (population % vs station count), so
// the UI can say: "12 stations cover 90% of the city".

import type { Point } from '../types.js';
import { distanceKm } from '../processing/idw.js';
import { LENGTH_SCALE_KM } from '../processing/fusion.js';

export const EFFECTIVE_RADIUS_KM = LENGTH_SCALE_KM * 1.6; // ≈4.8 km

interface Cell extends Point {
  weight: number;
}

// Population density anchors (district cores, rough relative weights).
const DENSITY_ANCHORS: Array<Point & { w: number }> = [
  { lat: 43.256, lng: 76.929, w: 1.0 },  // Алмалы (центр)
  { lat: 43.222, lng: 76.919, w: 0.95 }, // Бостандык
  { lat: 43.238, lng: 76.855, w: 0.9 },  // Ауэзов
  { lat: 43.216, lng: 76.844, w: 0.85 }, // Алатау/Аксай
  { lat: 43.293, lng: 76.860, w: 0.7 },  // Алатау север
  { lat: 43.339, lng: 76.985, w: 0.6 },  // Турксиб
  { lat: 43.296, lng: 76.925, w: 0.75 }, // Жетысу
  { lat: 43.230, lng: 76.970, w: 0.65 }, // Медеу (жилая часть)
  { lat: 43.196, lng: 76.820, w: 0.55 }, // Наурызбай
];

const BOUNDS = { latMin: 43.16, latMax: 43.36, lngMin: 76.78, lngMax: 77.03 };

function buildGrid(stepKm = 1): Cell[] {
  const dLat = stepKm / 111;
  const midLat = (BOUNDS.latMin + BOUNDS.latMax) / 2;
  const dLng = stepKm / (111 * Math.cos((midLat * Math.PI) / 180));
  const cells: Cell[] = [];
  for (let lat = BOUNDS.latMin; lat <= BOUNDS.latMax; lat += dLat) {
    for (let lng = BOUNDS.lngMin; lng <= BOUNDS.lngMax; lng += dLng) {
      const p = { lat, lng };
      // Weight = max anchor influence (Gaussian, 3.5 km scale) — cheap
      // population-density proxy without a real census raster.
      let w = 0;
      for (const a of DENSITY_ANCHORS) {
        const d = distanceKm(p, a);
        w = Math.max(w, a.w * Math.exp(-(d * d) / (2 * 3.5 * 3.5)));
      }
      if (w > 0.05) cells.push({ lat, lng, weight: w });
    }
  }
  return cells;
}

export interface Placement extends Point {
  order: number;
  gained_weight: number;
  cumulative_coverage: number; // 0..1 of total population weight
}

export interface PlacementResult {
  effective_radius_km: number;
  total_cells: number;
  placements: Placement[];
  coverage_curve: Array<{ stations: number; coverage: number }>;
  stations_for_90pct: number | null;
  existing_considered: number;
  note: string;
}

export function optimizePlacement(
  maxStations: number,
  existing: Point[] = [],
): PlacementResult {
  const cells = buildGrid(1);
  const totalWeight = cells.reduce((s, c) => s + c.weight, 0);
  const covered = new Array<boolean>(cells.length).fill(false);

  // Pre-cover cells already served by existing stations.
  for (const e of existing) {
    for (let i = 0; i < cells.length; i++) {
      if (!covered[i] && distanceKm(cells[i]!, e) <= EFFECTIVE_RADIUS_KM) covered[i] = true;
    }
  }
  let coveredWeight = cells.reduce((s, c, i) => s + (covered[i] ? c.weight : 0), 0);

  // Candidate sites = the grid itself (coarser step keeps it fast).
  const candidates = buildGrid(1.5);

  const placements: Placement[] = [];
  const curve: PlacementResult['coverage_curve'] = [
    { stations: 0, coverage: round3(coveredWeight / totalWeight) },
  ];
  let stationsFor90: number | null = coveredWeight / totalWeight >= 0.9 ? 0 : null;

  for (let n = 1; n <= maxStations; n++) {
    let best: { cand: Point; gain: number; idx: number[] } | null = null;
    for (const cand of candidates) {
      let gain = 0;
      const idx: number[] = [];
      for (let i = 0; i < cells.length; i++) {
        if (!covered[i] && distanceKm(cells[i]!, cand) <= EFFECTIVE_RADIUS_KM) {
          gain += cells[i]!.weight;
          idx.push(i);
        }
      }
      if (!best || gain > best.gain) best = { cand, gain, idx };
    }
    if (!best || best.gain <= 0.01) break;

    for (const i of best.idx) covered[i] = true;
    coveredWeight += best.gain;
    const cov = coveredWeight / totalWeight;
    placements.push({
      order: n,
      lat: Math.round(best.cand.lat * 10000) / 10000,
      lng: Math.round(best.cand.lng * 10000) / 10000,
      gained_weight: round3(best.gain / totalWeight),
      cumulative_coverage: round3(cov),
    });
    curve.push({ stations: n, coverage: round3(cov) });
    if (stationsFor90 === null && cov >= 0.9) stationsFor90 = n;
  }

  return {
    effective_radius_km: EFFECTIVE_RADIUS_KM,
    total_cells: cells.length,
    placements,
    coverage_curve: curve,
    stations_for_90pct: stationsFor90,
    existing_considered: existing.length,
    note:
      'Жадный set-cover по взвешенной сетке плотности населения; радиус станции — зона, где гауссово ядро fusion-модели сохраняет ≥25% веса.',
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
