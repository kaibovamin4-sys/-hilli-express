// Demo controls: force an anomaly, reseed history. Only mounted when USE_MOCK=true.

import type { FastifyPluginAsync } from 'fastify';
import { injectAnomaly, seedHistory, type AnomalyKind } from '../mock/generator.js';
import { config } from '../config.js';

const KINDS: AnomalyKind[] = ['traffic_spike', 'industrial_release', 'fire_smoke'];

export const mockRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/mock/inject-anomaly', {
    schema: {
      body: {
        type: 'object',
        required: ['device_id', 'kind'],
        properties: {
          device_id: { type: 'string' },
          kind: { type: 'string', enum: KINDS },
        },
      },
    },
  }, async (req) => {
    const b = req.body as { device_id: string; kind: AnomalyKind };
    injectAnomaly(b.device_id, b.kind);
    return { ok: true, device_id: b.device_id, kind: b.kind };
  });

  app.post('/api/mock/reseed', async () => {
    const r = seedHistory(config.mockSeedDays);
    return { ok: true, ...r };
  });
};
