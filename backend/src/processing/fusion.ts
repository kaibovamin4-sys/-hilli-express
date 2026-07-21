// Fusion estimate — maximum coverage from a minimal MQ fleet.
//
// Key idea: a lone MQ station cannot honestly measure air 10 km away, but the
// CITY BACKGROUND (Open-Meteo PM2.5 model) covers 100% of the map. So we
// decompose the field into two parts:
//
//   estimate(p) = background(p) + Σ_i K(d_i) * anomaly_i
//
//   background(p) — Open-Meteo PM2.5 for the point (available everywhere);
//   anomaly_i     — how much station i deviates RIGHT NOW from its own
//                   24h rolling baseline (local event: smoke, jam, works);
//   K(d)          — Gaussian kernel exp(-d²/2L²): the local event's influence
//                   decays smoothly; L (length scale) defaults to 3 km, so a
//                   single station meaningfully covers a ~6-8 km diameter
//                   patch — half a district — while never pretending to
//                   measure the far side of the city.
//
// Far from any station the estimate converges to the city model,
// near a station local events dominate. Coverage is therefore 100% of the
// map with a variable confidence value instead of a hard blind cutoff.

import type { Point, ProcessedReading } from '../types.js';
import { distanceKm } from './idw.js';
import { processedRange } from '../db/repositories.js';

export const LENGTH_SCALE_KM = 3.0;

export interface StationAnomaly extends Point {
  device_id: string;
  name: string;
  current_aqi: number;
  baseline_aqi: number;
  anomaly: number;         // current - baseline (positive = worse than usual)
}

export interface FusionResult {
  pm25: number;                 // final estimate at the point, µg/m³
  background_pm25: number;      // city model part
  local_correction: number;     // Σ kernel-weighted anomalies, in PM2.5-equivalent
  confidence: number;           // 0..1 — how much local sensing backs this point
  effective_stations: Array<{ device_id: string; name: string; distance_km: number; kernel: number; anomaly: number }>;
  method: string;
}

// Composite AQI → rough PM2.5-equivalent for expressing MQ anomalies on the
// same scale as the background.
const AQI_TO_PM = 1 / 5;

export function stationAnomalies(
  devices: Array<{ id: string; name: string; lat: number; lng: number }>,
): StationAnomaly[] {
  const now = Date.now();
  const out: StationAnomaly[] = [];
  for (const d of devices) {
    const rows = processedRange(
      d.id,
      new Date(now - 24 * 3_600_000).toISOString(),
      new Date(now).toISOString(),
    );
    if (rows.length < 10) continue;
    const current = mean(rows.slice(-5).map((r) => r.aqi_composite));
    const baseline = mean(rows.map((r) => r.aqi_composite));
    out.push({
      device_id: d.id,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      current_aqi: Math.round(current),
      baseline_aqi: Math.round(baseline),
      anomaly: current - baseline,
    });
  }
  return out;
}

export function fuseAt(
  p: Point,
  backgroundPm25: number,
  anomalies: StationAnomaly[],
  lengthScaleKm = LENGTH_SCALE_KM,
): FusionResult {
  let correction = 0;
  let kernelSum = 0;
  const effective: FusionResult['effective_stations'] = [];

  for (const a of anomalies) {
    const d = distanceKm(p, a);
    const k = Math.exp(-(d * d) / (2 * lengthScaleKm * lengthScaleKm));
    if (k < 0.01) continue;
    // Only positive anomalies propagate at full weight; negative (cleaner
    // than usual) propagate at half — a smoke plume spreads, "clean luck"
    // doesn't.
    const contribution = a.anomaly > 0 ? a.anomaly : a.anomaly * 0.5;
    correction += k * contribution * AQI_TO_PM;
    kernelSum += k;
    effective.push({
      device_id: a.device_id,
      name: a.name,
      distance_km: Math.round(d * 100) / 100,
      kernel: Math.round(k * 1000) / 1000,
      anomaly: Math.round(a.anomaly),
    });
  }

  effective.sort((x, y) => y.kernel - x.kernel);

  const pm25 = Math.max(0, backgroundPm25 + correction);
  return {
    pm25: Math.round(pm25 * 10) / 10,
    background_pm25: Math.round(backgroundPm25 * 10) / 10,
    local_correction: Math.round(correction * 10) / 10,
    confidence: Math.round(Math.min(1, 0.5 + kernelSum / 2) * 100) / 100,
    effective_stations: effective.slice(0, 5),
    method: `Open-Meteo фон + гауссовы MQ-поправки (L=${lengthScaleKm} км)`,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
