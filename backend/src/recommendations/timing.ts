// Best walk-window finder.
//
// Score each hour ahead by (air+heat+cold+uv+rain), pick the best contiguous
// 60–120-min block. Score is dimensionless — lower = better.

import type { WalkWindow, WeatherForecast, AirQualityExternal } from '../types.js';

export interface WindowInput {
  weather: WeatherForecast;
  airHourly: { time: string[]; values: number[] };  // PM2.5 hourly
  now?: Date;
  minMinutes?: number;
  maxMinutes?: number;
  horizonHours?: number;
}

export function findBestWalkWindow(input: WindowInput): WalkWindow | null {
  const now = input.now ?? new Date();
  const minH = Math.ceil((input.minMinutes ?? 60) / 60);
  const maxH = Math.ceil((input.maxMinutes ?? 120) / 60);
  const horizon = input.horizonHours ?? 12;

  const scores = hourlyScores(input, now, horizon);
  if (scores.length < minH) return null;

  let best: { start: number; end: number; score: number } | null = null;
  for (let len = minH; len <= Math.min(maxH, scores.length); len++) {
    for (let i = 0; i + len <= scores.length; i++) {
      const slice = scores.slice(i, i + len);
      const avg = slice.reduce((a, b) => a + b.score, 0) / len;
      if (!best || avg < best.score) {
        best = { start: i, end: i + len - 1, score: avg };
      }
    }
  }
  if (!best) return null;

  const start = scores[best.start]!;
  const end = scores[best.end]!;
  return {
    start: start.time,
    end: hourPlusOneIso(end.time),
    quality_score: Math.round((100 - Math.min(100, best.score)) * 10) / 10,
    reason: describe(start, end, best.score),
  };
}

interface HourScore {
  time: string;
  score: number;
  temp: number;
  uv: number;
  rain: number;
  pm: number;
}

function hourlyScores(
  input: WindowInput,
  now: Date,
  horizon: number,
): HourScore[] {
  const w = input.weather;
  const out: HourScore[] = [];
  for (let i = 0; i < w.hourly.time.length && out.length < horizon; i++) {
    const t = new Date(w.hourly.time[i]!);
    if (t.getTime() < now.getTime() - 30 * 60_000) continue;

    const temp = w.hourly.apparent_temperature[i] ?? 20;
    const uv = w.hourly.uv_index[i] ?? 0;
    const rain = w.hourly.precipitation[i] ?? 0;
    const pm = matchPm(input.airHourly, w.hourly.time[i]!);

    let score = 0;
    // Air (0..100)
    score += Math.min(100, (pm / 35) * 40);
    // Heat penalty over 25°C, cold under 5°C
    if (temp > 25) score += (temp - 25) * 4;
    if (temp < 5) score += (5 - temp) * 3;
    if (temp < -10) score += (Math.abs(temp) - 10) * 4;
    // UV over 6
    if (uv > 6) score += (uv - 6) * 6;
    // Rain
    score += rain * 15;

    out.push({ time: w.hourly.time[i]!, score, temp, uv, rain, pm });
  }
  return out;
}

function matchPm(airHourly: { time: string[]; values: number[] }, iso: string): number {
  const idx = airHourly.time.indexOf(iso);
  if (idx >= 0) return airHourly.values[idx] ?? 0;
  return 0;
}

// Add one hour to a local-time string ("YYYY-MM-DDTHH:MM") without going
// through Date parsing — that flips the string into UTC and shifts the day.
function hourPlusOneIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [y, mo, d, h, mi] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!];
  const utc = Date.UTC(y, mo - 1, d, h, mi) + 60 * 60_000;
  const nd = new Date(utc);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}T${pad(nd.getUTCHours())}:${pad(nd.getUTCMinutes())}`;
}

function describe(a: HourScore, b: HourScore, avgScore: number): string {
  const parts: string[] = [];
  parts.push(`PM2.5 ≈ ${Math.round((a.pm + b.pm) / 2)}`);
  parts.push(`${Math.round(a.temp)}…${Math.round(b.temp)}°C`);
  if (Math.max(a.uv, b.uv) >= 6) parts.push(`УФ до ${Math.round(Math.max(a.uv, b.uv))}`);
  if (Math.max(a.rain, b.rain) > 0.2) parts.push('возможен дождь');
  parts.push(avgScore < 30 ? 'условия комфортные' : avgScore < 60 ? 'условия средние' : 'условия непростые');
  return parts.join(', ');
}
