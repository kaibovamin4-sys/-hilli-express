// Sensor health / trustworthiness score.
//
// Four factors, weighted:
//   uptime       — readings received vs expected over the last 24 h
//   data_quality — fraction of processed readings with quality_flag='ok'
//   agreement    — how far this sensor's aqi deviates from an IDW estimate
//                  built from the OTHER sensors (leave-one-out). Big deviation
//                  → drift or fault.
//   drift        — slope of the sensor's 7-day baseline: if the "clean-air"
//                  ratio Rs/R0 is walking, R0 is stale.
//
// Final score 0..100. Below 60 → we hide this station from IDW at query time.

import type { Device } from '../types.js';
import { getDb } from '../db/client.js';
import { latestProcessedByDevice, listDevices, processedRange } from '../db/repositories.js';
import { idw, type IdwSource } from '../processing/idw.js';

export interface SensorHealth {
  device_id: string;
  name: string;
  score: number;                       // 0..100
  status: 'healthy' | 'watch' | 'suspect' | 'offline';
  factors: {
    uptime: number;
    data_quality: number;
    agreement: number;
    drift: number;
  };
  last_seen_min_ago: number | null;
  received_24h: number;
  expected_24h: number;
  neighbor_deviation_aqi: number | null;
  hints: string[];
}

export function computeSensorHealth(deviceId: string, expectedIntervalSec = 30): SensorHealth | null {
  const device = listDevices(false).find((d) => d.id === deviceId);
  if (!device) return null;

  const now = Date.now();
  const from = new Date(now - 24 * 60 * 60_000).toISOString();
  const to = new Date(now).toISOString();
  const readings = processedRange(deviceId, from, to);
  const rawCount = getDb()
    .prepare('SELECT COUNT(*) AS n FROM readings_raw WHERE device_id = ? AND ts >= ?')
    .get(deviceId, from) as { n: number };

  const expected = Math.floor((24 * 60 * 60) / expectedIntervalSec);
  const uptime = clamp01(rawCount.n / expected);

  const ok = readings.filter((r) => r.quality_flag === 'ok').length;
  const data_quality = readings.length === 0 ? 0 : clamp01(ok / readings.length);

  // Agreement via leave-one-out IDW.
  const others = buildOthersSources(deviceId);
  const latest = readings[readings.length - 1];
  let neighbor_deviation_aqi: number | null = null;
  let agreement = 1;
  if (latest && others.length >= 2) {
    const est = idw({ lat: device.lat, lng: device.lng }, others);
    if (est.contributions.length > 0) {
      neighbor_deviation_aqi = Math.round(Math.abs(latest.aqi_composite - est.value));
      // 0 diff → agreement=1; ≥100 aqi diff → agreement=0.
      agreement = clamp01(1 - neighbor_deviation_aqi / 100);
    }
  }

  // Drift: slope of 7-day daily-max readings; if trending up while others
  // aren't, R0 is likely stale. We use device's own long-term trend as a
  // simple proxy.
  const drift = computeDrift(deviceId);

  const factors = { uptime, data_quality, agreement, drift };
  const score = Math.round(
    100 * (0.35 * uptime + 0.2 * data_quality + 0.3 * agreement + 0.15 * drift),
  );

  const status: SensorHealth['status'] =
    device.last_seen_at == null || (now - Date.parse(device.last_seen_at)) > 15 * 60_000
      ? 'offline'
      : score >= 80 ? 'healthy'
      : score >= 60 ? 'watch'
      : 'suspect';

  const hints: string[] = [];
  if (uptime < 0.6) hints.push(`Пропущено ${(100 * (1 - uptime)).toFixed(0)}% пакетов за сутки`);
  if (data_quality < 0.8) hints.push('Много флагов качества (нет T/RH-компенсации или прогрев)');
  if (neighbor_deviation_aqi != null && neighbor_deviation_aqi > 60) {
    hints.push(`Отклонение от соседей на ${neighbor_deviation_aqi} AQI — возможна калибровка / загрязнение сенсора`);
  }
  if (drift < 0.6) hints.push('Долгосрочный тренд не согласуется с моделью — стоит пересчитать R0');

  return {
    device_id: deviceId,
    name: device.name,
    score,
    status,
    factors: {
      uptime: round2(uptime),
      data_quality: round2(data_quality),
      agreement: round2(agreement),
      drift: round2(drift),
    },
    last_seen_min_ago: device.last_seen_at
      ? Math.round((now - Date.parse(device.last_seen_at)) / 60_000)
      : null,
    received_24h: rawCount.n,
    expected_24h: expected,
    neighbor_deviation_aqi,
    hints,
  };
}

export function healthForAll(): SensorHealth[] {
  return listDevices(true)
    .map((d) => computeSensorHealth(d.id))
    .filter((h): h is SensorHealth => h != null);
}

function buildOthersSources(excludeId: string): IdwSource[] {
  const devices = listDevices(true).filter((d) => d.id !== excludeId);
  const latest = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));
  return devices
    .filter((d) => latest.has(d.id))
    .map((d) => ({
      lat: d.lat, lng: d.lng, device_id: d.id, name: d.name,
      value: latest.get(d.id)!.aqi_composite,
    }));
}

function computeDrift(deviceId: string): number {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const to = new Date().toISOString();
  const rows = processedRange(deviceId, from, to);
  if (rows.length < 20) return 0.7; // insufficient data → neutral score

  // Simple check: is the mean over recent 24 h consistent with the 7-day mean?
  // If it drifted by >40% in either direction and this device has been up
  // continuously, that suggests baseline drift.
  const day1 = rows.filter((r) => new Date(r.ts).getTime() >= Date.now() - 24 * 60 * 60_000);
  const week = rows;
  if (day1.length === 0 || week.length === 0) return 0.7;
  const m1 = day1.reduce((s, r) => s + r.aqi_composite, 0) / day1.length;
  const mw = week.reduce((s, r) => s + r.aqi_composite, 0) / week.length;
  const rel = Math.abs(m1 - mw) / Math.max(1, mw);
  return clamp01(1 - Math.max(0, rel - 0.15) * 2);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
