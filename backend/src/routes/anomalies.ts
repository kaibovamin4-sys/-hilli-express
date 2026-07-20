import type { FastifyPluginAsync } from 'fastify';
import { recentAnomalies } from '../db/repositories.js';
import { scanAllDevices } from '../services/anomalyScan.js';

export const anomaliesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/anomalies', {
    schema: {
      querystring: {
        type: 'object',
        properties: { since: { type: 'string' } },
      },
    },
  }, async (req) => {
    const q = req.query as { since?: string };
    const since = q.since ?? new Date(Date.now() - 24 * 3_600_000).toISOString();
    return { anomalies: recentAnomalies(since) };
  });

  // Manual scan trigger (the server also runs this on a 5-minute timer).
  app.post('/api/anomalies/scan', {
    schema: {
      body: {
        type: 'object',
        properties: {
          hours: { type: 'integer', minimum: 1, maximum: 48, default: 3 },
        },
      },
    },
  }, async (req) => {
    const b = (req.body ?? {}) as { hours?: number };
    const hours = b.hours ?? 3;
    return { scanned_hours: hours, results: scanAllDevices(hours) };
  });
};
