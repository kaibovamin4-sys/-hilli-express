// 6-hour AQI forecast.
//
// Two independent signals:
//   1) Local trend: Holt linear exponential smoothing on the last N hours of
//      our own aqi_composite series. Captures the direction we're actually
//      moving, at high resolution.
//   2) Open-Meteo PM2.5 hourly forecast: a physics-informed anchor from a
//      global model. Translated into "expected AQI equivalent" using our
//      composite scale.
//
// We blend: 60% local (short horizon), 40% external. Confidence drops with
// horizon and disagreement between the two signals.

import { getAirQuality } from '../external/openMeteo.js';
import { processedRange } from '../db/repositories.js';
import { levelFromPm25 } from '../processing/status.js';
import { aqiToPm, pmToAqi } from '../processing/aqi.js';
import type { StatusLevel } from '../types.js';

export interface ForecastPoint {
  ts: string;
  aqi: number;
  pm25: number;
  status: StatusLevel;
  confidence: number;
  sources: { local: number; external: number };
}

export interface ForecastResult {
  device_id: string;
  generated_at: string;
  horizon_hours: number;
  points: ForecastPoint[];
  method: string;
}

export async function forecastAqi(
  deviceId: string, lat: number, lng: number, horizonHours = 6,
): Promise<ForecastResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 60 * 60_000);
  const rows = processedRange(deviceId, from.toISOString(), now.toISOString());
  const local = rows.length >= 6 ? holtForecast(rows.map((r) => r.aqi_composite), horizonHours) : null;

  let externalHourly: { time: string[]; pm25: number[] } = { time: [], pm25: [] };
  try {
    const air = await getAirQuality(lat, lng);
    externalHourly = {
      time: air.hourly_pm25.time.slice(0, 24),
      pm25: air.hourly_pm25.values.slice(0, 24),
    };
  } catch { /* fall back to local only */ }

  const points: ForecastPoint[] = [];
  for (let h = 1; h <= horizonHours; h++) {
    const ts = new Date(now.getTime() + h * 60 * 60_000);
    const isoLocal = ts.toISOString().slice(0, 13) + ':00'; // for matching Open-Meteo hourly labels
    const externalIdx = externalHourly.time.findIndex((t) => t.startsWith(isoLocal.slice(0, 13)));
    const externalPm = externalIdx >= 0 ? externalHourly.pm25[externalIdx] ?? null : null;
    const externalAqi = externalPm != null ? pmToAqi(externalPm) : null;

    const localAqi = local ? local[h - 1] : null;

    let aqi: number;
    let confidence: number;
    let src = { local: 0, external: 0 };
    if (localAqi != null && externalAqi != null) {
      aqi = 0.6 * localAqi + 0.4 * externalAqi;
      const disagreement = Math.abs(localAqi - externalAqi);
      confidence = Math.max(0.3, 1 - disagreement / 200 - h * 0.05);
      src = { local: 0.6, external: 0.4 };
    } else if (localAqi != null) {
      aqi = localAqi;
      confidence = Math.max(0.2, 0.8 - h * 0.08);
      src = { local: 1, external: 0 };
    } else if (externalAqi != null) {
      aqi = externalAqi;
      confidence = Math.max(0.3, 0.7 - h * 0.05);
      src = { local: 0, external: 1 };
    } else {
      aqi = 0;
      confidence = 0;
    }

    const pm25 = externalPm ?? aqiToPm(aqi);
    points.push({
      ts: ts.toISOString(),
      aqi: Math.round(aqi),
      pm25: Math.round(pm25 * 10) / 10,
      status: levelFromPm25(pm25),
      confidence: Math.round(confidence * 100) / 100,
      sources: src,
    });
  }

  return {
    device_id: deviceId,
    generated_at: now.toISOString(),
    horizon_hours: horizonHours,
    points,
    method: 'Holt exponential smoothing (60%) + Open-Meteo PM2.5 forecast (40%)',
  };
}

// Holt linear exponential smoothing (level + trend)
function holtForecast(series: number[], horizon: number, alpha = 0.5, beta = 0.15): number[] {
  if (series.length < 3) return new Array(horizon).fill(series[series.length - 1] ?? 0);
  let level = series[0]!;
  let trend = series[1]! - series[0]!;
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level;
    level = alpha * series[i]! + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) out.push(Math.max(0, level + h * trend));
  return out;
}

