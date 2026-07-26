// Reference PM2.5 from outside our own network.
//
// Two providers behind one interface, because the honest answer depends on what
// is available:
//
//   openaq     — real reference-grade monitoring stations (OpenAQ aggregates
//                national networks, Kazhydromet among them). This is ground
//                truth. Needs OPENAQ_KEY; the v3 API requires one.
//   open-meteo — the CAMS-based model we already use for the background field.
//                Always available, no key. It is *not* ground truth, and rows
//                from it are stored with kind='model' so nothing downstream can
//                quietly present a model as a measurement.
//
// The distinction is carried in the data rather than in a comment, so the
// accuracy screen can say which one it is looking at.

import { request } from 'undici';
import { config } from '../config.js';
import { getAirQuality } from './openMeteo.js';
import type { Point } from '../types.js';

export interface ReferenceSample {
  source: string;
  kind: 'station' | 'model';
  station_ref: string | null;
  lat: number;
  lng: number;
  ts: string;
  pm2_5: number | null;
  pm10: number | null;
}

const OPENAQ_URL = 'https://api.openaq.org/v3/parameters/2/latest';

/** Whole-hour UTC timestamp — the granularity everything is compared at. */
function hourStamp(iso: string | number | Date): string {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Reference-grade stations within `radiusKm` of the city centre. Returns an
 * empty list rather than throwing when the key is absent or the service is
 * down — the collector then falls back to the model provider.
 */
async function fromOpenAq(centre: Point, radiusKm: number): Promise<ReferenceSample[]> {
  if (!config.openaqKey) return [];
  const params = new URLSearchParams({
    coordinates: `${centre.lat},${centre.lng}`,
    // OpenAQ caps the radius at 25 km; asking for more is a 422, not a wider search.
    radius: String(Math.min(25_000, Math.round(radiusKm * 1000))),
    limit: '100',
  });
  const { statusCode, body } = await request(`${OPENAQ_URL}?${params}`, {
    headers: { 'X-API-Key': config.openaqKey, 'user-agent': 'aua-backend/1.0' },
  });
  const text = await body.text();
  if (statusCode >= 400) throw new Error(`OpenAQ ${statusCode}: ${text.slice(0, 160)}`);

  const json = JSON.parse(text) as {
    results?: Array<{
      datetime?: { utc?: string };
      value?: number;
      coordinates?: { latitude?: number; longitude?: number };
      sensorsId?: number;
      locationsId?: number;
    }>;
  };

  return (json.results ?? [])
    .filter((r) => typeof r.value === 'number' && r.coordinates?.latitude != null)
    .map((r) => ({
      source: 'openaq',
      kind: 'station' as const,
      station_ref: String(r.locationsId ?? r.sensorsId ?? 'unknown'),
      lat: r.coordinates!.latitude!,
      lng: r.coordinates!.longitude!,
      ts: hourStamp(r.datetime?.utc ?? Date.now()),
      pm2_5: r.value ?? null,
      pm10: null,
    }));
}

/** One model sample per requested point. */
async function fromOpenMeteo(points: Point[]): Promise<ReferenceSample[]> {
  const out: ReferenceSample[] = [];
  for (const p of points) {
    try {
      const air = await getAirQuality(p.lat, p.lng);
      out.push({
        source: 'open-meteo',
        kind: 'model',
        // Keyed by rounded coordinates so repeated polls of the same point
        // collide on the UNIQUE constraint instead of piling up duplicates.
        station_ref: `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`,
        lat: p.lat,
        lng: p.lng,
        ts: hourStamp(air.current.ts),
        pm2_5: air.current.pm2_5,
        pm10: air.current.pm10,
      });
    } catch {
      /* one unreachable point should not abandon the rest */
    }
  }
  return out;
}

export interface ReferenceFetch {
  samples: ReferenceSample[];
  /** What actually answered — the UI labels the comparison with this. */
  source: 'openaq' | 'open-meteo';
  degraded: boolean;
}

/**
 * Prefers real stations, falls back to the model. `degraded` is true when the
 * fallback was used, so the screen can say "сравнение с моделью, не с эталоном"
 * instead of overstating what the archive contains.
 */
export async function fetchReference(points: Point[], centre: Point): Promise<ReferenceFetch> {
  if (config.openaqKey) {
    try {
      const samples = await fromOpenAq(centre, 25);
      if (samples.length > 0) return { samples, source: 'openaq', degraded: false };
    } catch {
      /* fall through to the model */
    }
  }
  return { samples: await fromOpenMeteo(points), source: 'open-meteo', degraded: true };
}
