import type { FastifyPluginAsync } from 'fastify';
import { listDevices, getDevice, listDistricts, updateR0, getRecentRaw } from '../db/repositories.js';
import { calibrateR0 } from '../processing/calibration.js';
import { requireAdmin } from '../auth/admin.js';

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/devices', async () => {
    // Strip secrets before returning.
    return {
      devices: listDevices(true).map((d) => ({
        id: d.id,
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        district: d.district,
        firmware: d.firmware,
        last_seen_at: d.last_seen_at,
      })),
    };
  });

  app.get('/api/districts', async () => ({ districts: listDistricts() }));

  // Admin: recompute R0 from the last N minutes of raw readings (assumes clean air).
  app.post('/api/devices/:id/calibrate', {
    preHandler: requireAdmin,
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          window_minutes: { type: 'integer', minimum: 1, maximum: 240, default: 5 },
        },
      },
    },
  }, async (req, reply) => {
    const p = req.params as { id: string };
    const b = (req.body ?? {}) as { window_minutes?: number };
    const win = b.window_minutes ?? 5;
    const device = getDevice(p.id);
    if (!device) return reply.code(404).send({ error: 'unknown_device' });

    const sinceIso = new Date(Date.now() - win * 60_000).toISOString();
    const raws = getRecentRaw(p.id, sinceIso);
    if (raws.length < 5) return reply.code(422).send({ error: 'not_enough_samples' });

    // Calibrate only the channels this device actually reports. Feeding an
    // absent channel's NULLs into calibrateR0 would fix its baseline against
    // nothing and then silently distort every later PPM reading.
    const calibrate = (
      pick: (r: (typeof raws)[number]) => number | null,
      kind: 'mq2' | 'mq4' | 'mq8' | 'mq135',
      current: number,
    ): number => {
      const samples = raws.map(pick).filter((v): v is number => v != null);
      if (samples.length < 5) return current;
      return calibrateR0(samples, device.vcc_mv, device.rl_ohm, kind);
    };

    const r0_mq2 = calibrate((r) => r.mq2_adc, 'mq2', device.r0_mq2);
    const r0_mq4 = calibrate((r) => r.mq4_adc, 'mq4', device.r0_mq4);
    const r0_mq8 = calibrate((r) => r.mq8_adc, 'mq8', device.r0_mq8);
    const r0_mq135 = calibrate((r) => r.mq135_adc, 'mq135', device.r0_mq135);

    updateR0(p.id, { r0_mq2, r0_mq4, r0_mq8, r0_mq135 });
    return { device_id: p.id, sensor_kind: device.sensor_kind, r0_mq2, r0_mq4, r0_mq8, r0_mq135, samples: raws.length };
  });
};
