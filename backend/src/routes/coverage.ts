// Coverage grid: samples an equirectangular grid around the city, runs IDW at
// each point, returns cell = { lat, lng, aqi, blind, confidence }. The map
// draws this as a heat overlay + blind-zone shading.

import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { latestProcessedByDevice, listDevices } from '../db/repositories.js';
import { idw, type IdwSource } from '../processing/idw.js';

interface Cell {
  lat: number;
  lng: number;
  aqi: number;
  blind: boolean;
  confidence: number;
}

export const coverageRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/coverage', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          size_km: { type: 'number', default: 30 },
          step_km: { type: 'number', default: 2 },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { size_km?: number; step_km?: number };
    const size = q.size_km ?? 30;
    const step = q.step_km ?? 2;

    const devices = listDevices(true);
    const latest = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));
    const sources: IdwSource[] = devices
      .filter((d) => latest.has(d.id))
      .map((d) => ({
        lat: d.lat, lng: d.lng, device_id: d.id, name: d.name,
        value: latest.get(d.id)!.aqi_composite,
      }));

    const center = { lat: config.cityLat, lng: config.cityLng };
    const dLat = step / 111;
    const dLng = step / (111 * Math.cos((center.lat * Math.PI) / 180));
    const halfLat = size / 111 / 2;
    const halfLng = size / (111 * Math.cos((center.lat * Math.PI) / 180)) / 2;

    const cells: Cell[] = [];
    for (let lat = center.lat - halfLat; lat <= center.lat + halfLat; lat += dLat) {
      for (let lng = center.lng - halfLng; lng <= center.lng + halfLng; lng += dLng) {
        const r = idw({ lat, lng }, sources);
        cells.push({
          lat: Math.round(lat * 10000) / 10000,
          lng: Math.round(lng * 10000) / 10000,
          aqi: Math.round(r.value),
          blind: r.is_blind_zone,
          confidence: Math.round(r.confidence * 100) / 100,
        });
      }
    }
    return { center, size_km: size, step_km: step, cells };
  });
};
