// ML forecast endpoints.
//
// /api/forecast/ml is the one the app calls. It accepts either a station id or
// a free coordinate — from a coordinate it anchors on the nearest station,
// because the local lag features have to come from a real sensor series.
//
// When the model can't be served (cold start, too little history, Open-Meteo
// unreachable) the route falls back to the Holt + Open-Meteo blend rather than
// erroring, and says so in `fallback` so the UI can label the source honestly.

import type { FastifyPluginAsync } from 'fastify';
import { getDevice, listDevices } from '../db/repositories.js';
import { distanceKm } from '../processing/idw.js';
import { forecastAqi } from '../analytics/forecast.js';
import { mlForecast, modelState, trainModels } from '../ml/service.js';
import { requireAdmin } from '../auth/admin.js';
import { config } from '../config.js';
import type { Device } from '../types.js';

function nearestDevice(lat: number, lng: number): Device | null {
  const devices = listDevices(true);
  if (devices.length === 0) return null;
  let best = devices[0]!;
  let bestD = distanceKm({ lat, lng }, best);
  for (const d of devices.slice(1)) {
    const dist = distanceKm({ lat, lng }, d);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

export const mlRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/forecast/ml', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          device_id: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
          hours: { type: 'integer', minimum: 1, maximum: 6, default: 6 },
        },
      },
    },
  }, async (req, reply) => {
    const q = req.query as { device_id?: string; lat?: number; lng?: number; hours?: number };
    const lat = q.lat ?? config.cityLat;
    const lng = q.lng ?? config.cityLng;

    const device = q.device_id ? getDevice(q.device_id) : nearestDevice(lat, lng);
    if (!device) return reply.code(404).send({ error: 'unknown_device' });

    const hours = q.hours ?? 6;
    const anchor = { lat: q.lat ?? device.lat, lng: q.lng ?? device.lng };

    try {
      const ml = await mlForecast(device.id, anchor.lat, anchor.lng, hours);
      if (ml) {
        return {
          ...ml,
          fallback: false,
          anchor: { ...anchor, station: device.name, distance_km: Math.round(distanceKm(anchor, device) * 100) / 100 },
        };
      }
    } catch (e) {
      req.log.warn({ err: e }, 'ml forecast failed, falling back');
    }

    const holt = await forecastAqi(device.id, anchor.lat, anchor.lng, hours);
    return {
      device_id: holt.device_id,
      generated_at: holt.generated_at,
      horizon_hours: holt.horizon_hours,
      points: holt.points.map((p, i) => ({
        ts: p.ts,
        horizon: i + 1,
        aqi: p.aqi,
        pm25: p.pm25,
        status: p.status,
        // No trained residuals to draw a band from; widen with the horizon so
        // the chart still communicates that later hours are less certain.
        aqi_low: Math.max(0, Math.round(p.aqi * (1 - 0.08 * (i + 1)))),
        aqi_high: Math.round(p.aqi * (1 + 0.08 * (i + 1))),
        confidence: p.confidence,
        baseline_aqi: p.aqi,
      })),
      model: {
        method: holt.method,
        trained_at: holt.generated_at,
        stations: 1,
        train_rows: 0,
        validation_rows: 0,
        history_days: 0,
        hyperparameters: null,
        accuracy: [],
        importance: [],
      },
      fallback: true,
      fallback_reason: modelState().error ?? 'модель ещё обучается',
      anchor: { ...anchor, station: device.name, distance_km: Math.round(distanceKm(anchor, device) * 100) / 100 },
    };
  });

  // Model card: what was trained, on what, and how well it scored.
  app.get('/api/ml/model', async () => {
    const { model, error, training } = modelState();
    if (!model) return { ready: false, training, error };
    return {
      ready: true,
      training,
      error,
      trained_at: model.trained_at,
      stations: model.stations,
      train_rows: model.train_rows,
      validation_rows: model.validation_rows,
      history_days: model.history_days,
      hyperparameters: model.hyperparameters,
      importance: model.importance,
      accuracy: [...model.horizons.values()].map((h) => ({
        horizon: h.horizon,
        mae: h.metrics.mae,
        rmse: h.metrics.rmse,
        r2: h.metrics.r2,
        residual_std: h.residualStd,
        baseline_mae: h.baseline.mae,
        external_mae: h.externalOnly.mae,
        improvement_vs_baseline:
          h.baseline.mae > 0 ? Math.round((1 - h.metrics.mae / h.baseline.mae) * 1000) / 10 : 0,
      })),
    };
  });

  app.post('/api/ml/retrain', { preHandler: requireAdmin }, async () => {
    const model = await trainModels();
    return model
      ? { ok: true, trained_at: model.trained_at, train_rows: model.train_rows }
      : { ok: false, error: modelState().error };
  });
};
