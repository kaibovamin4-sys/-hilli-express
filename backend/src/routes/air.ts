import type { FastifyPluginAsync } from 'fastify';
import { latestMq135AirReadings } from '../db/repositories.js';

export const airRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/air', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { limit?: number };
    const readings = latestMq135AirReadings(q.limit ?? 1);
    return {
      latest: readings[0] ?? null,
      readings,
    };
  });
};
