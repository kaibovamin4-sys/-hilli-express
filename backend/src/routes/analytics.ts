// All six "wow" analytics endpoints in one file — they're thin HTTP wrappers
// around pure functions in src/analytics/*.

import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { cigarettesFromExposure } from '../analytics/cigarettes.js';
import { classify } from '../analytics/classifier.js';
import { forecastAqi } from '../analytics/forecast.js';
import { ventilationWindows } from '../analytics/ventilation.js';
import { analyseRoute } from '../analytics/route.js';
import { computeSensorHealth, healthForAll } from '../analytics/sensorHealth.js';
import { getAirQuality } from '../external/openMeteo.js';
import { processedRange, getDevice } from '../db/repositories.js';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // ─── 1. Cigarettes equivalent ───────────────────────────────────────────
  app.get('/api/cigarettes', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          hours: { type: 'number', default: 24, minimum: 0.5, maximum: 168 },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number; hours?: number };
    const lat = q.lat ?? config.cityLat;
    const lng = q.lng ?? config.cityLng;
    const hours = q.hours ?? 24;
    let pm = 15;
    try {
      const a = await getAirQuality(lat, lng);
      pm = a.current.pm2_5 ?? 15;
    } catch { /* fall back to WHO guideline */ }
    return cigarettesFromExposure(pm, hours);
  });

  // ─── 2. Anomaly classifier ──────────────────────────────────────────────
  app.get('/api/classify/:device_id', {
    schema: {
      params: {
        type: 'object', required: ['device_id'],
        properties: { device_id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const p = req.params as { device_id: string };
    if (!getDevice(p.device_id)) return reply.code(404).send({ error: 'unknown_device' });
    const now = Date.now();
    const recent = processedRange(
      p.device_id,
      new Date(now - 15 * 60_000).toISOString(),
      new Date(now).toISOString(),
    );
    const baseline = processedRange(
      p.device_id,
      new Date(now - 3 * 60 * 60_000).toISOString(),
      new Date(now - 15 * 60_000).toISOString(),
    );
    const c = classify({ recent, baseline });
    return { device_id: p.device_id, ts: new Date().toISOString(), ...c };
  });

  // ─── 3. AQI forecast (6h default) ───────────────────────────────────────
  app.get('/api/forecast/aqi', {
    schema: {
      querystring: {
        type: 'object', required: ['device_id'],
        properties: {
          device_id: { type: 'string' },
          hours: { type: 'integer', default: 6, minimum: 1, maximum: 24 },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    const q = req.query as { device_id: string; hours?: number; lat?: number; lng?: number };
    const device = getDevice(q.device_id);
    if (!device) return reply.code(404).send({ error: 'unknown_device' });
    const lat = q.lat ?? device.lat;
    const lng = q.lng ?? device.lng;
    return forecastAqi(q.device_id, lat, lng, q.hours ?? 6);
  });

  // ─── 4. Ventilation windows ─────────────────────────────────────────────
  app.get('/api/ventilation', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          indoor_target_c: { type: 'number', default: 22 },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number; indoor_target_c?: number };
    return ventilationWindows(
      q.lat ?? config.cityLat,
      q.lng ?? config.cityLng,
      q.indoor_target_c ?? 22,
    );
  });

  // ─── 5. Route exposure ──────────────────────────────────────────────────
  app.post('/api/route-exposure', {
    schema: {
      body: {
        type: 'object',
        required: ['waypoints'],
        properties: {
          waypoints: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              required: ['lat', 'lng'],
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
          },
          step_km: { type: 'number', minimum: 0.05, maximum: 5, default: 0.25 },
          speed_kmh: { type: 'number', minimum: 1, maximum: 40, default: 5 },
        },
      },
    },
  }, async (req) => {
    const b = req.body as { waypoints: Array<{ lat: number; lng: number }>; step_km?: number; speed_kmh?: number };
    return analyseRoute(b);
  });

  // ─── 6. Sensor health ───────────────────────────────────────────────────
  app.get('/api/sensor-health', async () => ({ devices: healthForAll() }));

  app.get('/api/sensor-health/:device_id', {
    schema: {
      params: {
        type: 'object', required: ['device_id'],
        properties: { device_id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const p = req.params as { device_id: string };
    const h = computeSensorHealth(p.device_id);
    if (!h) return reply.code(404).send({ error: 'unknown_device' });
    return h;
  });
};
