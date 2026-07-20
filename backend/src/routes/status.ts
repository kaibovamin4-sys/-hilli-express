import type { FastifyPluginAsync } from 'fastify';
import { computeFullStatus } from '../services/statusService.js';
import type { Profile } from '../types.js';

const PROFILES: Profile[] = [
  'default', 'infant', 'child', 'asthma', 'allergy', 'elderly', 'athlete', 'pregnant',
];

export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/status', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90 },
          lng: { type: 'number', minimum: -180, maximum: 180 },
          profile: { type: 'string', enum: PROFILES },
          district: { type: 'string' },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { lat: number; lng: number; profile?: Profile; district?: string };
    return computeFullStatus({
      point: { lat: q.lat, lng: q.lng },
      profile: q.profile,
      district: q.district ?? null,
    });
  });
};
