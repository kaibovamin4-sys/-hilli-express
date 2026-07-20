import type { FastifyPluginAsync } from 'fastify';
import { latestProcessedByDevice, processedRange, getDevice } from '../db/repositories.js';

export const readingsRoutes: FastifyPluginAsync = async (app) => {
  // All latest readings — used by the coverage map / list
  app.get('/api/readings/latest', async () => {
    return { readings: latestProcessedByDevice() };
  });

  // Time-series for a device (raw resolution; downsampling if needed handled client-side or in a v2)
  app.get('/api/readings/history', {
    schema: {
      querystring: {
        type: 'object',
        required: ['device_id'],
        properties: {
          device_id: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const q = req.query as { device_id: string; from?: string; to?: string };
    if (!getDevice(q.device_id)) return reply.code(404).send({ error: 'unknown_device' });
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 24 * 60 * 60_000);
    return { device_id: q.device_id, readings: processedRange(q.device_id, from.toISOString(), to.toISOString()) };
  });
};
