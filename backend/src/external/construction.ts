// Active construction sites layer.
//
// Demo dataset of large ongoing construction zones in Almaty (labelled as
// demo). Each site has a dust radius: inside it PM10/dust exposure is
// elevated, so walking recommendations degrade. Swap-in point: feed from the
// city permit registry or 2GIS API without touching consumers.

import type { Point } from '../types.js';
import { distanceKm } from '../processing/idw.js';

export interface ConstructionSite extends Point {
  id: string;
  name: string;
  kind: 'residential' | 'road' | 'infrastructure';
  dust_radius_km: number;   // radius of noticeable dust impact
  intensity: number;        // 0..1 — how heavy the works are
}

export const SITES: ConstructionSite[] = [
  { id: 'c1', name: 'ЖК на Абая/Момышулы', kind: 'residential', lat: 43.2405, lng: 76.8570, dust_radius_km: 0.8, intensity: 0.8 },
  { id: 'c2', name: 'Развязка Саина–Райымбека', kind: 'road', lat: 43.2710, lng: 76.8455, dust_radius_km: 1.2, intensity: 0.9 },
  { id: 'c3', name: 'ЖК в Бостандыкском р-не', kind: 'residential', lat: 43.2180, lng: 76.9120, dust_radius_km: 0.7, intensity: 0.7 },
  { id: 'c4', name: 'Реконструкция Сейфуллина', kind: 'road', lat: 43.2620, lng: 76.9425, dust_radius_km: 1.0, intensity: 0.75 },
  { id: 'c5', name: 'Метро — продление линии', kind: 'infrastructure', lat: 43.2340, lng: 76.8660, dust_radius_km: 0.9, intensity: 0.85 },
  { id: 'c6', name: 'ЖК у Аль-Фараби/Достык', kind: 'residential', lat: 43.2230, lng: 76.9580, dust_radius_km: 0.6, intensity: 0.65 },
  { id: 'c7', name: 'Логистический центр, Турксиб', kind: 'infrastructure', lat: 43.3320, lng: 76.9770, dust_radius_km: 1.1, intensity: 0.8 },
];

export interface ConstructionImpact {
  inside_zone: boolean;
  nearest: { id: string; name: string; kind: string; distance_km: number; dust_radius_km: number } | null;
  // 0..1: 1 = right at an intense site, 0 = no influence
  dust_factor: number;
  sites_within_2km: number;
  demo_note: string;
}

export function constructionImpact(p: Point): ConstructionImpact {
  let nearest: { s: ConstructionSite; d: number } | null = null;
  let factor = 0;
  let within2 = 0;

  for (const s of SITES) {
    const d = distanceKm(p, s);
    if (d < 2) within2++;
    if (!nearest || d < nearest.d) nearest = { s, d };
    // Linear falloff inside dust radius, weighted by intensity.
    if (d < s.dust_radius_km) {
      factor = Math.max(factor, s.intensity * (1 - d / s.dust_radius_km));
    }
  }

  return {
    inside_zone: factor > 0,
    nearest: nearest
      ? {
          id: nearest.s.id,
          name: nearest.s.name,
          kind: nearest.s.kind,
          distance_km: Math.round(nearest.d * 100) / 100,
          dust_radius_km: nearest.s.dust_radius_km,
        }
      : null,
    dust_factor: Math.round(factor * 100) / 100,
    sites_within_2km: within2,
    demo_note: 'Демо-слой крупных строек; продовый источник — реестр разрешений акимата / 2GIS.',
  };
}
