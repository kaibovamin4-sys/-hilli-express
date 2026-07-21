// Walk spots (parks, squares, promenades) + address geocoding.
//
// Spots: static dataset of Almaty green zones. Each request ranks them by a
// walkability score built from live layers: fused PM2.5, traffic and
// construction penalties, distance to the user. Green zones also get a bonus
// — vegetation buffers particulates, and measured city background overstates
// in-park exposure.
//
// Geocoding: OSM Nominatim (key-free, UA header required, cached 24h, viewbox
// clamped to Almaty). Swap-in point for 2GIS/Yandex geocoder later.

import { request } from 'undici';
import type { Point } from '../types.js';
import { distanceKm } from '../processing/idw.js';
import { cached } from './cache.js';

export interface WalkSpot extends Point {
  id: string;
  name: string;
  kind: 'park' | 'square' | 'promenade' | 'mountain';
  green_bonus: number; // 0..1 — density of greenery / elevation advantage
}

export const WALK_SPOTS: WalkSpot[] = [
  { id: 'first-president', name: 'Парк Первого Президента', kind: 'park', lat: 43.1926, lng: 76.8916, green_bonus: 0.8 },
  { id: 'central-park', name: 'Центральный парк культуры и отдыха', kind: 'park', lat: 43.2494, lng: 76.9662, green_bonus: 0.7 },
  { id: 'panfilov', name: 'Парк 28 панфиловцев', kind: 'park', lat: 43.2586, lng: 76.9532, green_bonus: 0.6 },
  { id: 'baum', name: 'Роща Баума', kind: 'park', lat: 43.2891, lng: 76.9576, green_bonus: 0.75 },
  { id: 'botanic', name: 'Ботанический сад', kind: 'park', lat: 43.2213, lng: 76.9110, green_bonus: 0.85 },
  { id: 'terrenkur', name: 'Терренкур (набережная Есентай)', kind: 'promenade', lat: 43.2274, lng: 76.9410, green_bonus: 0.65 },
  { id: 'koktobe', name: 'Кок-Тобе', kind: 'mountain', lat: 43.2325, lng: 76.9770, green_bonus: 0.9 },
  { id: 'medeu-road', name: 'Дорога на Медеу', kind: 'mountain', lat: 43.1800, lng: 77.0300, green_bonus: 0.95 },
  { id: 'family-park', name: 'Family Park', kind: 'park', lat: 43.2683, lng: 76.8931, green_bonus: 0.55 },
  { id: 'gandhi', name: 'Сквер им. Махатмы Ганди', kind: 'square', lat: 43.2367, lng: 76.9095, green_bonus: 0.5 },
  { id: 'sairan', name: 'Озеро Сайран', kind: 'promenade', lat: 43.2465, lng: 76.8760, green_bonus: 0.6 },
  { id: 'almaty-arboretum', name: 'Дендропарк (Аксай)', kind: 'park', lat: 43.2205, lng: 76.8280, green_bonus: 0.7 },
];

// ─── Geocoding via Nominatim ──────────────────────────────────────────────

// Almaty bounding box: lng 76.7..77.15, lat 43.10..43.42
const VIEWBOX = '76.70,43.42,77.15,43.10';
const GEOCODE_TTL_MS = 24 * 3_600_000;

export interface GeocodeHit extends Point {
  display_name: string;
}

export async function geocode(query: string): Promise<GeocodeHit[]> {
  const key = `geo:${query.toLowerCase().trim()}`;
  return cached(key, GEOCODE_TTL_MS, async () => {
    const q = new URLSearchParams({
      q: `${query}, Алматы`,
      format: 'json',
      limit: '5',
      countrycodes: 'kz',
      viewbox: VIEWBOX,
      bounded: '1',
      'accept-language': 'ru',
    });
    const { statusCode, body } = await request(
      `https://nominatim.openstreetmap.org/search?${q.toString()}`,
      { headers: { 'user-agent': 'aua-almaty/1.0 (air-quality demo)' } },
    );
    const text = await body.text();
    if (statusCode >= 400) throw new Error(`Nominatim ${statusCode}: ${text.slice(0, 120)}`);
    const rows = JSON.parse(text) as Array<{ lat: string; lon: string; display_name: string }>;
    return rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      display_name: r.display_name,
    }));
  });
}

// ─── Spot ranking ─────────────────────────────────────────────────────────

export interface RankedSpot extends WalkSpot {
  distance_km: number;
  pm25_estimate: number;
  traffic_index: number;
  construction_zone: boolean;
  score: number;      // higher = better
  verdict: 'отлично' | 'хорошо' | 'приемлемо' | 'не сегодня';
  reason: string;
}

export interface SpotContext {
  user: Point;
  pm25At: (p: Point) => number;
  trafficAt: (p: Point) => number;          // 0..10
  constructionAt: (p: Point) => number;     // dust factor 0..1
}

export function rankSpots(ctx: SpotContext, limit = 6): RankedSpot[] {
  const ranked = WALK_SPOTS.map((s) => {
    const dist = distanceKm(ctx.user, s);
    const basePm = ctx.pm25At(s);
    // Greenery buffers particulates: up to −30% at green_bonus = 1.
    const pm = basePm * (1 - 0.3 * s.green_bonus);
    const traffic = ctx.trafficAt(s);
    const dust = ctx.constructionAt(s);

    // Score: air dominates, then city penalties, mild distance decay.
    let score = 100;
    score -= pm * 1.6;
    score -= traffic * 2;
    score -= dust * 25;
    score -= Math.min(20, dist * 2);
    score += s.green_bonus * 10;

    const verdict: RankedSpot['verdict'] =
      pm >= 55 || dust > 0.5 ? 'не сегодня'
      : score >= 55 ? 'отлично'
      : score >= 35 ? 'хорошо'
      : 'приемлемо';

    const reasons: string[] = [`PM2.5 ≈ ${Math.round(pm)}`];
    if (s.green_bonus >= 0.7) reasons.push('зелёная зона');
    if (traffic >= 4.5) reasons.push('рядом пробки');
    if (dust > 0) reasons.push('рядом стройка');
    reasons.push(`${dist.toFixed(1)} км от вас`);

    return {
      ...s,
      distance_km: Math.round(dist * 10) / 10,
      pm25_estimate: Math.round(pm * 10) / 10,
      traffic_index: Math.round(traffic * 10) / 10,
      construction_zone: dust > 0,
      score: Math.round(score),
      verdict,
      reason: reasons.join(' · '),
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
