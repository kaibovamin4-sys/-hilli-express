// /api/compare-districts — rank districts by walkability right now.
// Uses local IDW at each district centroid, joined with external PM2.5.

import type { FastifyPluginAsync } from 'fastify';
import { listDistricts, latestProcessedByDevice, listDevices } from '../db/repositories.js';
import { idw, type IdwSource } from '../processing/idw.js';
import { statusFor } from '../processing/status.js';
import { getAirQuality } from '../external/openMeteo.js';

export const compareRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/compare-districts', async () => {
    const districts = listDistricts();
    const devices = listDevices(true);
    const latest = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));
    const sources: IdwSource[] = devices
      .filter((d) => latest.has(d.id))
      .map((d) => ({
        lat: d.lat, lng: d.lng, device_id: d.id, name: d.name,
        value: latest.get(d.id)!.aqi_composite,
      }));

    const rows = await Promise.all(
      districts.map(async (d) => {
        const local = idw({ lat: d.lat, lng: d.lng }, sources);
        let pm25: number | null = null;
        try {
          const a = await getAirQuality(d.lat, d.lng);
          pm25 = a.current.pm2_5;
        } catch { /* ignore */ }
        const s = statusFor({ aqiComposite: local.value, pm25External: pm25 });
        return {
          district: d.name,
          lat: d.lat,
          lng: d.lng,
          status: s.level,
          score: Math.round(s.score),
          aqi_composite: Math.round(local.value),
          pm2_5: pm25,
          confidence: Math.round(local.confidence * 100) / 100,
          is_blind_zone: local.is_blind_zone,
        };
      }),
    );
    // Best first
    rows.sort((a, b) => a.score - b.score);
    return { ranking: rows };
  });
};
