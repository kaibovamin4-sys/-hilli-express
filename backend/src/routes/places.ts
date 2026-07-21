// Walk spots ranking + address check.

import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { geocode, rankSpots } from '../external/places.js';
import { congestionAt } from '../external/traffic.js';
import { constructionImpact } from '../external/construction.js';
import { fuseAt, stationAnomalies } from '../processing/fusion.js';
import { getAirQuality } from '../external/openMeteo.js';
import { listDevices } from '../db/repositories.js';
import { computeFullStatus } from '../services/statusService.js';
import type { Point, Profile } from '../types.js';

export const placesRoutes: FastifyPluginAsync = async (app) => {
  // Best places to walk right now, ranked by live layers.
  app.get('/api/walk-spots', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          limit: { type: 'integer', minimum: 1, maximum: 12, default: 6 },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number; limit?: number };
    const user: Point = { lat: q.lat ?? config.cityLat, lng: q.lng ?? config.cityLng };

    let background = 15;
    try {
      const a = await getAirQuality(user.lat, user.lng);
      background = a.current.pm2_5 ?? 15;
    } catch { /* WHO guideline fallback */ }
    const anomalies = stationAnomalies(listDevices(true));

    const spots = rankSpots({
      user,
      pm25At: (p) => fuseAt(p, background, anomalies).pm25,
      trafficAt: (p) => congestionAt(p).index,
      constructionAt: (p) => constructionImpact(p).dust_factor,
    }, q.limit ?? 6);

    return { user, background_pm25: background, spots };
  });

  // Address check: "можно ли выпустить ребёнка во двор по этому адресу?"
  app.get('/api/check-address', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 3, maxLength: 200 },
          profile: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const query = req.query as { q: string; profile?: Profile };
    const hits = await geocode(query.q);
    if (hits.length === 0) {
      return reply.code(404).send({ error: 'address_not_found', hint: 'Уточните адрес: улица и номер дома.' });
    }
    const best = hits[0]!;
    const status = await computeFullStatus({
      point: { lat: best.lat, lng: best.lng },
      profile: query.profile,
    });
    return {
      address: best.display_name,
      lat: best.lat,
      lng: best.lng,
      alternatives: hits.slice(1, 4).map((h) => h.display_name),
      status: status.status,
      status_reason: status.status_reason,
      max_safe_duration_min: status.max_safe_duration_min,
      recommendations: status.recommendations.slice(0, 4),
      city: status.city,
      fusion: status.fusion,
    };
  });
};
