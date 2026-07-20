import type { FastifyPluginAsync } from 'fastify';
import { getDevice, insertRaw, insertProcessed, touchDeviceSeen } from '../db/repositories.js';
import { verify } from '../auth/hmac.js';
import { processReading } from '../processing/pipeline.js';
import type { RawReading } from '../types.js';

export const ingestRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/ingest', {
    schema: {
      headers: {
        type: 'object',
        required: ['x-device-id', 'x-signature'],
        properties: {
          'x-device-id': { type: 'string' },
          'x-signature': { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['ts', 'mq2_adc', 'mq4_adc', 'mq8_adc'],
        properties: {
          ts: { type: 'string' },
          mq2_adc: { type: 'integer', minimum: 0, maximum: 1023 },
          mq4_adc: { type: 'integer', minimum: 0, maximum: 1023 },
          mq8_adc: { type: 'integer', minimum: 0, maximum: 1023 },
          temp_c: { type: ['number', 'null'] },
          humidity: { type: ['number', 'null'] },
          vcc_mv: { type: ['integer', 'null'] },
        },
      },
    },
  }, async (req, reply) => {
    const deviceId = String(req.headers['x-device-id']);
    const signature = String(req.headers['x-signature']);
    const bodyStr = JSON.stringify(req.body);

    if (!verify(deviceId, bodyStr, signature)) {
      return reply.code(401).send({ error: 'bad_signature' });
    }
    const device = getDevice(deviceId);
    if (!device || !device.active) {
      return reply.code(404).send({ error: 'unknown_device' });
    }

    const b = req.body as Omit<RawReading, 'device_id'>;
    const raw: RawReading = { device_id: deviceId, ...b, temp_c: b.temp_c ?? null, humidity: b.humidity ?? null, vcc_mv: b.vcc_mv ?? null };

    insertRaw(raw);
    const processed = processReading(device, raw);
    insertProcessed(processed);
    touchDeviceSeen(deviceId, raw.ts);
    reply.code(204).send();
  });
};
