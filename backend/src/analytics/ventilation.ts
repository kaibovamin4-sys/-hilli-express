// "When to open windows".
//
// Heuristic: indoor air is worse than you think — recommend a ventilation
// window when all of these hold at once:
//   - outdoor PM2.5 low (below WHO 24h guideline ≈ 15 µg/m³ scaled by tolerance)
//   - not raining hard (< 2 mm/h)
//   - wind not extreme (< 12 m/s gusts)
//   - temperature is not so far from indoor comfort that it wastes heating/cooling
//
// Returns up to 3 windows over the next 24 h, each rated "excellent" / "good".

import type { WeatherForecast } from '../types.js';
import { getWeather, getAirQuality } from '../external/openMeteo.js';

export interface VentilationWindow {
  start: string;
  end: string;
  hours: number;
  quality: 'excellent' | 'good';
  reason: string;
}

export interface VentilationResult {
  generated_at: string;
  windows: VentilationWindow[];
  advice: string;
}

export async function ventilationWindows(
  lat: number, lng: number, indoorTargetC = 22,
): Promise<VentilationResult> {
  const [wRes, aRes] = await Promise.allSettled([getWeather(lat, lng), getAirQuality(lat, lng)]);
  const w = wRes.status === 'fulfilled' ? wRes.value : null;
  const a = aRes.status === 'fulfilled' ? aRes.value : null;
  const now = new Date();

  if (!w || !a) {
    return {
      generated_at: now.toISOString(),
      windows: [],
      advice: 'Не удалось получить прогноз погоды / воздуха.',
    };
  }

  const hours: Array<{ time: string; ok: boolean; quality: 'excellent' | 'good'; reason: string }> = [];
  for (let i = 0; i < Math.min(24, w.hourly.time.length); i++) {
    const t = new Date(w.hourly.time[i]!);
    if (t.getTime() < now.getTime() - 30 * 60_000) continue;

    const temp = w.hourly.apparent_temperature[i] ?? 20;
    const rain = w.hourly.precipitation[i] ?? 0;
    const wind = w.hourly.wind_speed_10m[i] ?? 0;
    const pmIdx = a.hourly_pm25.time.indexOf(w.hourly.time[i]!);
    const pm = pmIdx >= 0 ? a.hourly_pm25.values[pmIdx] ?? 15 : 15;

    const tempDelta = Math.abs(temp - indoorTargetC);
    const air_ok = pm < 20;
    const rain_ok = rain < 2;
    const wind_ok = wind < 12;
    const temp_ok = tempDelta < 18;
    const ok = air_ok && rain_ok && wind_ok && temp_ok;

    let quality: 'excellent' | 'good' = 'good';
    if (ok && pm < 10 && rain < 0.2 && tempDelta < 10 && wind < 8) quality = 'excellent';

    const reason = describe(pm, temp, rain, wind, air_ok, rain_ok, wind_ok, temp_ok);
    hours.push({ time: w.hourly.time[i]!, ok, quality, reason });
  }

  const groups = groupContiguous(hours);
  const windows = groups.slice(0, 3);

  const advice =
    windows.length === 0
      ? 'Сегодня хороших окон для проветривания нет. Используйте очиститель воздуха; проветривайте короткими всплесками (5 мин).'
      : windows[0]!.quality === 'excellent'
        ? 'Есть отличное окно — откройте окна на 15–30 минут.'
        : 'Есть подходящие окна. Проветривайте по 10–15 минут за раз.';

  return { generated_at: now.toISOString(), windows, advice };
}

function describe(
  pm: number, temp: number, rain: number, wind: number,
  air_ok: boolean, rain_ok: boolean, wind_ok: boolean, temp_ok: boolean,
): string {
  const parts: string[] = [];
  parts.push(`PM2.5 ${pm.toFixed(0)}`);
  parts.push(`${Math.round(temp)}°C`);
  if (rain > 0.1) parts.push(`осадки ${rain.toFixed(1)} мм`);
  if (wind > 6) parts.push(`ветер ${Math.round(wind)} м/с`);
  const problems: string[] = [];
  if (!air_ok) problems.push('воздух грязный');
  if (!rain_ok) problems.push('сильный дождь');
  if (!wind_ok) problems.push('сильный ветер');
  if (!temp_ok) problems.push('температурный контраст');
  return parts.join(', ') + (problems.length > 0 ? ` — не рекомендуется: ${problems.join(', ')}` : '');
}

function groupContiguous(
  hours: Array<{ time: string; ok: boolean; quality: 'excellent' | 'good'; reason: string }>,
): VentilationWindow[] {
  const out: VentilationWindow[] = [];
  let cur: typeof hours = [];
  for (const h of hours) {
    if (h.ok) {
      cur.push(h);
    } else if (cur.length > 0) {
      out.push(makeWindow(cur));
      cur = [];
    }
  }
  if (cur.length > 0) out.push(makeWindow(cur));
  // Best windows first — prefer excellent+long
  out.sort((a, b) => (b.quality === 'excellent' ? 1 : 0) - (a.quality === 'excellent' ? 1 : 0) || b.hours - a.hours);
  return out;
}

function makeWindow(
  hours: Array<{ time: string; ok: boolean; quality: 'excellent' | 'good'; reason: string }>,
): VentilationWindow {
  const start = hours[0]!.time;
  const last = hours[hours.length - 1]!;
  const anyGood = hours.some((h) => h.quality !== 'excellent');
  return {
    start,
    end: last.time,
    hours: hours.length,
    quality: anyGood ? 'good' : 'excellent',
    reason: last.reason,
  };
}
