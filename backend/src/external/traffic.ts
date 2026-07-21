// Traffic congestion model for Almaty. There's no free live-traffic API, so
// this is a synthetic model (every response is labelled as such): the main
// corridors plus a weekly/daily congestion profile tuned to local rush hours
// (morning peak toward the centre, evening peak outward, Friday worst).
//
// congestionAt(point, date) returns a 0..10 index for the nearest corridor,
// decayed by distance. To plug in a real provider (TomTom/2GIS) later, keep the
// interface and replace corridorLoad().

import type { Point } from '../types.js';
import { distanceKm } from '../processing/idw.js';
import { liveLoadFor, hasLiveTraffic } from './tomtom.js';

export interface Corridor {
  id: string;
  name: string;
  // Polyline approximated by 2-4 anchor points
  path: Point[];
  // Relative base load 0..1 (how busy this road is vs the busiest)
  base: number;
}

// Main Almaty corridors (approximate anchors).
export const CORRIDORS: Corridor[] = [
  { id: 'al-farabi', name: 'пр. Аль-Фараби', base: 1.0, path: [
    { lat: 43.2185, lng: 76.8585 }, { lat: 43.2215, lng: 76.9285 }, { lat: 43.2295, lng: 76.9565 }] },
  { id: 'abay', name: 'пр. Абая', base: 0.95, path: [
    { lat: 43.2400, lng: 76.8420 }, { lat: 43.2400, lng: 76.9100 }, { lat: 43.2405, lng: 76.9570 }] },
  { id: 'rayimbek', name: 'пр. Райымбека', base: 0.9, path: [
    { lat: 43.2705, lng: 76.8390 }, { lat: 43.2715, lng: 76.9110 }, { lat: 43.2725, lng: 76.9660 }] },
  { id: 'sain', name: 'ул. Саина', base: 0.85, path: [
    { lat: 43.1900, lng: 76.8480 }, { lat: 43.2350, lng: 76.8460 }, { lat: 43.2760, lng: 76.8450 }] },
  { id: 'seyfullin', name: 'пр. Сейфуллина', base: 0.8, path: [
    { lat: 43.2280, lng: 76.9410 }, { lat: 43.2650, lng: 76.9420 }, { lat: 43.2980, lng: 76.9440 }] },
  { id: 'dostyk', name: 'пр. Достык', base: 0.75, path: [
    { lat: 43.2130, lng: 76.9770 }, { lat: 43.2400, lng: 76.9570 }, { lat: 43.2580, lng: 76.9500 }] },
  { id: 'tole-bi', name: 'ул. Толе би', base: 0.8, path: [
    { lat: 43.2540, lng: 76.8420 }, { lat: 43.2545, lng: 76.9090 }, { lat: 43.2550, lng: 76.9560 }] },
  { id: 'vostochnaya', name: 'ВОАД', base: 0.7, path: [
    { lat: 43.2170, lng: 76.9920 }, { lat: 43.2610, lng: 76.9880 }, { lat: 43.3050, lng: 76.9750 }] },
  { id: 'ryskulov', name: 'пр. Рыскулова', base: 0.85, path: [
    { lat: 43.2930, lng: 76.8400 }, { lat: 43.2940, lng: 76.9120 }, { lat: 43.2950, lng: 76.9680 }] },
];

// Diurnal profile: 0..1 multiplier by local hour (weekday).
// Almaty: morning peak 8-10, evening peak 18-20 (worse), lunch bump.
function diurnal(hour: number, weekend: boolean): number {
  if (weekend) {
    // Flat, mild midday bump (bazaars/malls), no rush peaks.
    return 0.25 + 0.2 * Math.exp(-((hour - 14) ** 2) / 18);
  }
  const morning = 0.85 * Math.exp(-((hour - 8.7) ** 2) / 2.6);
  const evening = 1.0 * Math.exp(-((hour - 18.7) ** 2) / 3.2);
  const lunch = 0.3 * Math.exp(-((hour - 13) ** 2) / 4);
  const night = 0.08;
  return Math.min(1, night + morning + evening + lunch);
}

function fridayFactor(day: number): number {
  return day === 5 ? 1.15 : 1;
}

// Distance from a point to a corridor = min distance to its anchor segments
// (approximated by anchor points + midpoints — enough at city scale).
function corridorDistanceKm(p: Point, c: Corridor): number {
  let min = Infinity;
  for (let i = 0; i < c.path.length; i++) {
    min = Math.min(min, distanceKm(p, c.path[i]!));
    if (i + 1 < c.path.length) {
      const mid = {
        lat: (c.path[i]!.lat + c.path[i + 1]!.lat) / 2,
        lng: (c.path[i]!.lng + c.path[i + 1]!.lng) / 2,
      };
      min = Math.min(min, distanceKm(p, mid));
    }
  }
  return min;
}

export interface TrafficInfo {
  index: number;              // 0..10 at the requested point
  level: 'free' | 'moderate' | 'heavy' | 'jam';
  nearest_corridor: { id: string; name: string; distance_km: number; load: number } | null;
  city_average: number;       // 0..10 across corridors
  is_rush_hour: boolean;
  model_note: string;
}

export function congestionAt(p: Point, at: Date = new Date()): TrafficInfo {
  const hour = at.getHours() + at.getMinutes() / 60;
  const day = at.getDay();
  const weekend = day === 0 || day === 6;
  const tf = diurnal(hour, weekend) * fridayFactor(day);
  const live = hasLiveTraffic();

  // Per-corridor load on a 0..1 scale. Live TomTom reading wins when fresh;
  // otherwise the synthetic base × time-of-day factor.
  const loadOf = (c: Corridor): number => {
    const l = liveLoadFor(c.id);
    return l != null ? l : c.base * tf;
  };

  let best: { c: Corridor; d: number } | null = null;
  let cityLoadSum = 0;
  for (const c of CORRIDORS) {
    cityLoadSum += loadOf(c);
    const d = corridorDistanceKm(p, c);
    if (!best || d < best.d) best = { c, d };
  }
  const cityAvg = (cityLoadSum / CORRIDORS.length) * 10;

  let index = 0;
  let nearest: TrafficInfo['nearest_corridor'] = null;
  if (best) {
    const load = loadOf(best.c) * 10;
    // Congestion effect decays: full within 0.3 km of a corridor, ~0 past 2 km.
    const decay = Math.exp(-Math.max(0, best.d - 0.3) / 0.7);
    index = load * decay;
    nearest = {
      id: best.c.id,
      name: best.c.name,
      distance_km: Math.round(best.d * 100) / 100,
      load: Math.round(load * 10) / 10,
    };
  }

  const level: TrafficInfo['level'] =
    index >= 7 ? 'jam' : index >= 4.5 ? 'heavy' : index >= 2 ? 'moderate' : 'free';

  return {
    index: Math.round(index * 10) / 10,
    level,
    nearest_corridor: nearest,
    city_average: Math.round(cityAvg * 10) / 10,
    is_rush_hour: !weekend && tf > 0.55,
    model_note: live
      ? 'Live-данные TomTom Traffic Flow по ключевым магистралям Алматы.'
      : 'Модельная оценка по типовому недельному профилю Алматы, не live-данные. Интерфейс готов к подключению провайдера (TomTom/2GIS).',
  };
}
