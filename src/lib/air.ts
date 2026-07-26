// Client-side helpers kept post-integration. Heavy compute (IDW, anomalies,
// AQI composite) now lives on the backend — this file is only presentation
// glue: geometry for the map's blind-zone overlay, colour ramp, status→copy.

import type { StatusKey } from './api';

export type { StatusKey };

export interface GeoPoint { lat: number; lng: number }

export const BLIND_KM = 3.5;

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestPoint<T extends GeoPoint>(p: GeoPoint, posts: T[]): { d: number; post: T } | null {
  if (posts.length === 0) return null;
  let best = { d: Infinity, post: posts[0]! };
  for (const post of posts) {
    const d = distanceKm(p, post);
    if (d < best.d) best = { d, post };
  }
  return best;
}

export function isBlind(p: GeoPoint, posts: GeoPoint[]): boolean {
  return posts.every((post) => distanceKm(p, post) > BLIND_KM);
}

// The PM2.5 colour ramp used to live here too, with a third set of thresholds
// (35/75) that disagreed with both of the others. It is gone: bands and colours
// now come from `charts/primitives` only, so there is exactly one place where a
// number becomes a colour. See `pmBand` / `aqiBand` there.

export interface StatusCopy {
  key: StatusKey;
  word: string;
  cssVar: string;
  idx: string;
  sub: string;
}

const COPY: Record<StatusKey, StatusCopy> = {
  good: {
    key: 'good',
    word: 'Можно гулять',
    cssVar: 'var(--good)',
    idx: 'хороший',
    sub: 'Воздух в вашем районе сейчас чистый — гуляйте спокойно.',
  },
  mid: {
    key: 'mid',
    word: 'Недолго',
    cssVar: 'var(--mid)',
    idx: 'умеренный',
    sub: 'Короткая прогулка — нормально. Долгую активность на улице лучше отложить.',
  },
  bad: {
    key: 'bad',
    word: 'Лучше дома',
    cssVar: 'var(--bad)',
    idx: 'вредный',
    sub: 'Концентрация частиц высокая — сегодня день для дома и закрытых окон.',
  },
};

export const statusCopyFor = (key: StatusKey): StatusCopy => COPY[key];
