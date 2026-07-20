// Inverse-distance weighting.
//
// Estimate a value at any point from measurements at known posts.
// weight_i = 1 / distance_i^power   → close posts dominate.
// value = Σ(w_i * v_i) / Σ w_i.
//
// Extras:
//   - maxDistanceKm cutoff so far posts don't drag the estimate to city mean;
//   - contributions returned per-post for the "based on 3 posts, nearest 1.2 km" UI;
//   - confidence = min(1, Σw / threshold) so the UI can show a "rough estimate" band;
//   - blind zone detection: further than BLIND_KM from any post.

import type { IdwContribution, IdwResult, Point } from '../types.js';

export const BLIND_KM = 3.5;

export function distanceKm(a: Point, b: Point): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface IdwSource extends Point {
  device_id: string;
  name: string;
  value: number;
}

export interface IdwOptions {
  power?: number;
  maxDistanceKm?: number;
  weightConfidenceThreshold?: number;
}

export function idw(
  target: Point,
  sources: IdwSource[],
  opts: IdwOptions = {},
): IdwResult {
  const power = opts.power ?? 2;
  const maxKm = opts.maxDistanceKm ?? 10;
  const confThreshold = opts.weightConfidenceThreshold ?? 1.5;

  if (sources.length === 0) {
    return {
      value: 0,
      contributions: [],
      confidence: 0,
      nearest: null,
      is_blind_zone: true,
    };
  }

  const distances = sources.map((s) => ({ src: s, dist: distanceKm(target, s) }));
  distances.sort((a, b) => a.dist - b.dist);
  const nearest = distances[0]!;
  const isBlind = nearest.dist > BLIND_KM;

  // Exact-match: standing on top of a post — return that value.
  if (nearest.dist < 0.05) {
    return {
      value: nearest.src.value,
      contributions: [
        {
          device_id: nearest.src.device_id,
          name: nearest.src.name,
          distance_km: nearest.dist,
          weight: 1,
          value: nearest.src.value,
        },
      ],
      confidence: 1,
      nearest: { device_id: nearest.src.device_id, name: nearest.src.name, distance_km: nearest.dist },
      is_blind_zone: false,
    };
  }

  const inRange = distances.filter((d) => d.dist <= maxKm);
  const effective = inRange.length > 0 ? inRange : [nearest];

  const weights = effective.map((d) => 1 / Math.pow(d.dist, power));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const value = effective.reduce((s, d, i) => s + weights[i]! * d.src.value, 0) / totalWeight;

  const contributions: IdwContribution[] = effective.map((d, i) => ({
    device_id: d.src.device_id,
    name: d.src.name,
    distance_km: Math.round(d.dist * 100) / 100,
    weight: weights[i]! / totalWeight,
    value: d.src.value,
  }));

  const confidence = Math.min(1, totalWeight / confThreshold);

  return {
    value,
    contributions,
    confidence,
    nearest: {
      device_id: nearest.src.device_id,
      name: nearest.src.name,
      distance_km: Math.round(nearest.dist * 100) / 100,
    },
    is_blind_zone: isBlind,
  };
}

export function isBlindZone(target: Point, posts: Point[]): boolean {
  if (posts.length === 0) return true;
  return posts.every((p) => distanceKm(target, p) > BLIND_KM);
}
