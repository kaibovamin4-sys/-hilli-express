// City layers: traffic, construction, station-placement optimizer, fusion coverage.

import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { congestionAt, CORRIDORS } from '../external/traffic.js';
import { constructionImpact, SITES } from '../external/construction.js';
import { optimizePlacement } from '../analytics/placement.js';
import { fuseAt, stationAnomalies, LENGTH_SCALE_KM } from '../processing/fusion.js';
import { getAirQuality } from '../external/openMeteo.js';
import { listDevices } from '../db/repositories.js';

export const cityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/traffic', {
    schema: {
      querystring: {
        type: 'object',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number };
    const info = congestionAt({ lat: q.lat ?? config.cityLat, lng: q.lng ?? config.cityLng });
    return { ...info, corridors: CORRIDORS.map((c) => ({ id: c.id, name: c.name, path: c.path })) };
  });

  app.get('/api/construction', {
    schema: {
      querystring: {
        type: 'object',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number };
    const impact = constructionImpact({ lat: q.lat ?? config.cityLat, lng: q.lng ?? config.cityLng });
    return { ...impact, sites: SITES };
  });

  // Where to put the next N stations for max population coverage.
  app.get('/api/optimize-placement', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          stations: { type: 'integer', minimum: 1, maximum: 40, default: 20 },
          include_existing: { type: 'boolean', default: true },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { stations?: number; include_existing?: boolean };
    const existing = (q.include_existing ?? true)
      ? listDevices(true).map((d) => ({ lat: d.lat, lng: d.lng }))
      : [];
    return optimizePlacement(q.stations ?? 20, existing);
  });

  // Fusion estimate at a point — full-map coverage with confidence.
  app.get('/api/fusion', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      },
    },
  }, async (req) => {
    const q = req.query as { lat: number; lng: number };
    const air = await getAirQuality(q.lat, q.lng);
    const background = air.current.pm2_5 ?? 15;
    const result = fuseAt({ lat: q.lat, lng: q.lng }, background, stationAnomalies(listDevices(true)));
    return { ...result, length_scale_km: LENGTH_SCALE_KM };
  });
};
