import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { chat } from '../analytics/chatbot.js';
import { computeFullStatus } from '../services/statusService.js';
import { congestionAt } from '../external/traffic.js';
import { constructionImpact } from '../external/construction.js';
import type { Profile } from '../types.js';

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/chat', {
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 500 },
          lat: { type: 'number' },
          lng: { type: 'number' },
          profile: { type: 'string' },
        },
      },
    },
  }, async (req) => {
    const b = req.body as { message: string; lat?: number; lng?: number; profile?: Profile };
    const point = { lat: b.lat ?? config.cityLat, lng: b.lng ?? config.cityLng };
    const status = await computeFullStatus({ point, profile: b.profile });
    const reply = chat(b.message, {
      status,
      traffic: congestionAt(point),
      construction: constructionImpact(point),
    });
    return { ...reply, ts: new Date().toISOString() };
  });
};
