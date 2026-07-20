// Route exposure — given a polyline (list of lat/lng waypoints), sample it
// along the way, run IDW at each sample, integrate PM2.5 over the walking
// time. Output: total dose (µg·min), cigarettes-equivalent, worst segment.
//
// Sampling: constant step in kilometres so a long route doesn't blow up.
// Walking pace default 5 km/h.

import type { Point } from '../types.js';
import { idw, distanceKm, type IdwSource } from '../processing/idw.js';
import { latestProcessedByDevice, listDevices } from '../db/repositories.js';
import { getAirQuality } from '../external/openMeteo.js';
import { cigarettesFromExposure } from './cigarettes.js';

export interface RouteInput {
  waypoints: Point[];
  step_km?: number;
  speed_kmh?: number;
}

export interface RouteSample {
  lat: number;
  lng: number;
  distance_km: number;
  aqi: number;
  pm25: number;
}

export interface RouteResult {
  total_distance_km: number;
  duration_min: number;
  average_pm25: number;
  peak_pm25: number;
  peak_at_km: number;
  cigarettes: ReturnType<typeof cigarettesFromExposure>;
  samples: RouteSample[];
  advice: string;
}

export async function analyseRoute(input: RouteInput): Promise<RouteResult> {
  const step = input.step_km ?? 0.25;
  const speed = input.speed_kmh ?? 5;
  const waypoints = input.waypoints;
  if (waypoints.length < 2) throw new Error('At least two waypoints required');

  // Sample the polyline: linear interpolation between each segment.
  const samples: { lat: number; lng: number; distance_km: number }[] = [];
  let cumDist = 0;
  samples.push({ ...waypoints[0]!, distance_km: 0 });

  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1]!;
    const to = waypoints[i]!;
    const segLen = distanceKm(from, to);
    if (segLen <= 0) continue;
    const nSteps = Math.max(1, Math.floor(segLen / step));
    for (let k = 1; k <= nSteps; k++) {
      const t = k / nSteps;
      samples.push({
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
        distance_km: cumDist + segLen * t,
      });
    }
    cumDist += segLen;
  }

  // Build IDW sources once.
  const devices = listDevices(true);
  const latest = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));
  const sources: IdwSource[] = devices
    .filter((d) => latest.has(d.id))
    .map((d) => ({
      lat: d.lat, lng: d.lng, device_id: d.id, name: d.name,
      value: latest.get(d.id)!.aqi_composite,
    }));

  // External PM2.5 anchor (city-level).
  let cityPm: number | null = null;
  try {
    const a = await getAirQuality(waypoints[0]!.lat, waypoints[0]!.lng);
    cityPm = a.current.pm2_5;
  } catch { /* fall back to local-only */ }

  const enriched: RouteSample[] = samples.map((s) => {
    const r = idw({ lat: s.lat, lng: s.lng }, sources);
    const pm25 = cityPm != null ? Math.max(cityPm, r.value / 5) : r.value / 5;
    return {
      lat: Math.round(s.lat * 10000) / 10000,
      lng: Math.round(s.lng * 10000) / 10000,
      distance_km: Math.round(s.distance_km * 100) / 100,
      aqi: Math.round(r.value),
      pm25: Math.round(pm25 * 10) / 10,
    };
  });

  const totalKm = enriched[enriched.length - 1]!.distance_km;
  const durationMin = (totalKm / speed) * 60;
  const pmValues = enriched.map((s) => s.pm25);
  const avgPm = pmValues.reduce((a, b) => a + b, 0) / pmValues.length;
  const peakPm = Math.max(...pmValues);
  const peakIdx = pmValues.indexOf(peakPm);

  const cigs = cigarettesFromExposure(avgPm, durationMin / 60);

  const advice = peakPm > avgPm * 1.4
    ? `На ${enriched[peakIdx]!.distance_km.toFixed(1)} км маршрута заметный пик PM2.5 (${peakPm}). Рассмотрите альтернативный путь.`
    : cigs.cigarettes > 0.3
      ? `Маршрут «стоит» ${cigs.cigarettes_rounded} сигарет. Есть смысл сдвинуть прогулку по времени.`
      : `Маршрут в целом безопасен: ~${avgPm.toFixed(0)} µg/m³ в среднем.`;

  return {
    total_distance_km: Math.round(totalKm * 100) / 100,
    duration_min: Math.round(durationMin),
    average_pm25: Math.round(avgPm * 10) / 10,
    peak_pm25: peakPm,
    peak_at_km: Math.round(enriched[peakIdx]!.distance_km * 100) / 100,
    cigarettes: cigs,
    samples: enriched,
    advice,
  };
}
