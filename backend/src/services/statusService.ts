// Builds the full /api/status payload: local IDW estimate, external
// weather/air/pollen, recommendations, and the best walk window. This is the
// layer that decides what the client renders.

import { config } from '../config.js';
import { getWeather, getAirQuality } from '../external/openMeteo.js';
import { idw, distanceKm, type IdwSource } from '../processing/idw.js';
import { statusFor } from '../processing/status.js';
import { fuseAt, stationAnomalies } from '../processing/fusion.js';
import { congestionAt } from '../external/traffic.js';
import { constructionImpact } from '../external/construction.js';
import { generateRecommendations } from '../recommendations/engine.js';
import { findBestWalkWindow } from '../recommendations/timing.js';
import { latestProcessedByDevice, listDevices, getDevice, latestForDevice, recentAnomalies } from '../db/repositories.js';
import type { FullStatus, Point, Profile, Recommendation } from '../types.js';

export interface StatusRequest {
  point: Point;
  profile?: Profile;
  district?: string | null;
}

export async function computeFullStatus(req: StatusRequest): Promise<FullStatus> {
  const profile: Profile = req.profile ?? 'default';
  const districts = req.district ?? null;

  const devices = listDevices(true);
  const latestMap = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));
  const sources: IdwSource[] = devices
    .filter((d) => latestMap.has(d.id))
    .map((d) => ({
      lat: d.lat,
      lng: d.lng,
      device_id: d.id,
      name: d.name,
      value: latestMap.get(d.id)!.aqi_composite,
    }));

  const local = idw(req.point, sources);

  // Nearest device's raw ppm values — for showing "MQ2/4/8 сейчас" fields.
  const nearestReading = local.nearest ? latestForDevice(local.nearest.device_id) : null;

  const [weather, airQ] = await Promise.allSettled([
    getWeather(req.point.lat, req.point.lng),
    getAirQuality(req.point.lat, req.point.lng),
  ]);

  const w = weather.status === 'fulfilled' ? weather.value : null;
  const a = airQ.status === 'fulfilled' ? airQ.value : null;

  // Fusion: city background plus Gaussian MQ corrections give a PM2.5 estimate
  // covers the whole map (confidence varies instead of hard blind zones).
  const fusion = a?.current.pm2_5 != null
    ? fuseAt(req.point, a.current.pm2_5, stationAnomalies(devices))
    : null;

  // Traffic and construction add local penalties: near a jammed corridor or a
  // construction dust zone the air is worse than the background model shows.
  const traffic = congestionAt(req.point);
  const construction = constructionImpact(req.point);
  const trafficPenalty = traffic.index >= 4.5 ? (traffic.index / 10) * 8 : 0;
  const constructionPenalty = construction.dust_factor * 15;

  const effectivePm = fusion
    ? fusion.pm25 + trafficPenalty + constructionPenalty
    : a?.current.pm2_5 ?? null;

  const status = statusFor({
    aqiComposite: local.value,
    pm25External: effectivePm,
  });
  if (trafficPenalty > 0 || constructionPenalty > 0) {
    status.reason += ` (+${Math.round(trafficPenalty + constructionPenalty)} µg/m³: ${[
      trafficPenalty > 0 ? 'пробки' : null,
      constructionPenalty > 0 ? 'стройка рядом' : null,
    ].filter(Boolean).join(', ')})`;
  }

  // Smoke event detection: any severe anomaly on mq2 or mq8 in the last hour
  // within 5km of the requested point.
  const smokeEvent = detectNearbySmoke(req.point, devices);

  const engine = generateRecommendations({
    status: status.level,
    aqiComposite: local.value,
    weather: w?.current ?? null,
    air: a?.current ?? null,
    pollen: a?.pollen ?? null,
    profile,
    smokeEvent,
  });

  const walk = w && a
    ? findBestWalkWindow({
        weather: w,
        airHourly: a.hourly_pm25,
      })
    : null;

  // City-layer advisories appended to the engine's list.
  const cityRecs: Recommendation[] = [];
  if (construction.inside_zone && construction.nearest) {
    cityRecs.push({
      category: 'safety',
      priority: construction.dust_factor > 0.5 ? 'warn' : 'advice',
      icon: 'construction',
      title: 'Рядом активная стройка',
      body: `«${construction.nearest.name}» в ${construction.nearest.distance_km} км — крупная пыль и шум. Для прогулки выберите другое направление.`,
    });
  }
  if (traffic.is_rush_hour && traffic.index >= 4.5 && traffic.nearest_corridor) {
    cityRecs.push({
      category: 'air',
      priority: 'advice',
      icon: 'traffic',
      title: 'Час пик у магистрали',
      body: `${traffic.nearest_corridor.name} в ${traffic.nearest_corridor.distance_km} км загружена (${traffic.index}/10). Гуляйте во дворах и парках, не вдоль дороги.`,
    });
  }

  return {
    ts: new Date().toISOString(),
    location: { lat: req.point.lat, lng: req.point.lng, district: districts },
    status: status.level,
    status_reason: status.reason,
    confidence: local.confidence,
    is_blind_zone: local.is_blind_zone,
    local: {
      aqi_composite: Math.round(local.value),
      mq2_ppm: nearestReading?.mq2_ppm ?? 0,
      mq4_ppm: nearestReading?.mq4_ppm ?? 0,
      mq8_ppm: nearestReading?.mq8_ppm ?? 0,
      based_on: local.confidence > 0.9 ? 'measurement' : 'interpolation',
      nearest_post: local.nearest,
      contributing_posts: local.contributions,
    },
    external: {
      weather: w?.current ?? null,
      air_quality: a?.current ?? null,
      pollen: a?.pollen ?? null,
    },
    recommendations: [...cityRecs, ...engine.recommendations],
    best_walk_window: walk,
    max_safe_duration_min: engine.max_safe_duration_min,
    city: {
      traffic: {
        index: traffic.index,
        level: traffic.level,
        is_rush_hour: traffic.is_rush_hour,
        nearest_corridor: traffic.nearest_corridor
          ? { name: traffic.nearest_corridor.name, distance_km: traffic.nearest_corridor.distance_km }
          : null,
      },
      construction: {
        inside_zone: construction.inside_zone,
        dust_factor: construction.dust_factor,
        nearest: construction.nearest
          ? { name: construction.nearest.name, distance_km: construction.nearest.distance_km }
          : null,
      },
    },
    fusion: fusion
      ? {
          pm25: fusion.pm25,
          background_pm25: fusion.background_pm25,
          local_correction: fusion.local_correction,
          confidence: fusion.confidence,
          method: fusion.method,
        }
      : null,
    disclaimer:
      'Оценка индикативная. PM2.5 — фон Open-Meteo + локальные MQ-поправки; пробки и стройки — модельные слои. Это не медицинский прибор.',
  };
}

function detectNearbySmoke(point: Point, devices: { id: string; lat: number; lng: number }[]): boolean {
  const sinceIso = new Date(Date.now() - 3_600_000).toISOString();
  const recent = recentAnomalies(sinceIso);
  if (recent.length === 0) return false;
  const near = new Set(devices.filter((d) => distanceKm(point, d) <= 5).map((d) => d.id));
  return recent.some(
    (a) => near.has(a.device_id) && (a.metric.includes('mq2') || a.metric.includes('mq8')) && a.severity >= 3,
  );
}
