// Standalone /api/recommendations — same engine, but returns only the advice
// bit. Useful for third-party consumers (chatbot, widget).

import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { computeFullStatus } from '../services/statusService.js';
import type { Profile } from '../types.js';

const PROFILES: Profile[] = [
  'default', 'infant', 'child', 'asthma', 'allergy', 'elderly', 'athlete', 'pregnant',
];

export const recommendationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/recommendations', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          profile: { type: 'string', enum: PROFILES },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number; profile?: Profile };
    const point = { lat: q.lat ?? config.cityLat, lng: q.lng ?? config.cityLng };
    const full = await computeFullStatus({ point, profile: q.profile });
    return {
      ts: full.ts,
      status: full.status,
      recommendations: full.recommendations,
      max_safe_duration_min: full.max_safe_duration_min,
      best_walk_window: full.best_walk_window,
    };
  });
};
