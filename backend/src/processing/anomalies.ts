// Rolling z-score anomaly detector.
//
// For each point compare it to the rolling mean/std of the preceding window;
// flag when |x - μ| > z * σ. Consecutive flagged points are collapsed into one
// event with peak value + severity (max z observed).
//
// z-score picked (not Isolation Forest / STL) because at our data volume it's
// explainable — "3 sigma above the last hour" is a defensible answer.

import type { AnomalyEvent, ProcessedReading } from '../types.js';
import { mean, std } from './smoothing.js';

export interface AnomalyOptions {
  windowSize?: number;
  zThreshold?: number;
  metric?: 'mq2_ppm' | 'mq4_ppm' | 'mq8_ppm' | 'aqi_composite';
}

interface Flagged {
  ts: string;
  value: number;
  z: number;
}

export function detectAnomalies(
  deviceId: string,
  readings: ProcessedReading[],
  opts: AnomalyOptions = {},
): AnomalyEvent[] {
  const window = opts.windowSize ?? 30;
  const z = opts.zThreshold ?? 2.5;
  const metric = opts.metric ?? 'aqi_composite';

  if (readings.length < window + 5) return [];

  const flagged: Flagged[] = [];
  for (let i = window; i < readings.length; i++) {
    const win = readings.slice(i - window, i).map((r) => r[metric]);
    const m = mean(win);
    const s = std(win);
    if (s < 1e-3) continue;
    const value = readings[i]![metric];
    const zScore = (value - m) / s;
    if (Math.abs(zScore) > z) {
      flagged.push({ ts: readings[i]!.ts, value, z: Math.abs(zScore) });
    }
  }

  return groupConsecutive(deviceId, metric, flagged);
}

function groupConsecutive(deviceId: string, metric: string, flagged: Flagged[]): AnomalyEvent[] {
  if (flagged.length === 0) return [];
  const events: AnomalyEvent[] = [];
  let current: Flagged[] = [flagged[0]!];

  for (let i = 1; i < flagged.length; i++) {
    const prev = new Date(current[current.length - 1]!.ts).getTime();
    const now = new Date(flagged[i]!.ts).getTime();
    // Group readings within 15 min of each other into one event.
    if (now - prev <= 15 * 60_000) {
      current.push(flagged[i]!);
    } else {
      events.push(makeEvent(deviceId, metric, current));
      current = [flagged[i]!];
    }
  }
  events.push(makeEvent(deviceId, metric, current));
  return events;
}

function makeEvent(deviceId: string, metric: string, group: Flagged[]): AnomalyEvent {
  const peak = group.reduce((p, c) => (c.value > p.value ? c : p), group[0]!);
  const severity = Math.max(...group.map((g) => g.z));
  return {
    device_id: deviceId,
    metric,
    ts_start: group[0]!.ts,
    ts_end: group[group.length - 1]!.ts,
    peak_value: peak.value,
    severity: Math.round(severity * 100) / 100,
  };
}
