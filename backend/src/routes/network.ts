// Where the network goes next.
//
// The map draws today's stations and tomorrow's side by side, so this endpoint
// turns the raw output of the placement optimiser into something presentable:
// each proposed site gets the name of the district it lands in, a rollout
// phase, and the share of the city's population it would newly cover.

import type { FastifyPluginAsync } from 'fastify';
import { listDevices, listDistricts } from '../db/repositories.js';
import { optimizePlacement } from '../analytics/placement.js';
import { distanceKm } from '../processing/idw.js';
import type { Point } from '../types.js';

// Rollout phases by position in the greedy order. The optimiser sorts by
// marginal coverage, so the earliest sites are also the ones worth funding
// first — the phases are just that ordering made legible.
function phaseOf(order: number): { phase: number; label: string } {
  if (order <= 3) return { phase: 1, label: 'Этап 1 · ближайший' };
  if (order <= 6) return { phase: 2, label: 'Этап 2' };
  return { phase: 3, label: 'Этап 3 · перспектива' };
}

function nearestDistrictName(p: Point, districts: Array<{ name: string; lat: number; lng: number }>): string | null {
  if (districts.length === 0) return null;
  let best = districts[0]!;
  let bestD = distanceKm(p, best);
  for (const d of districts.slice(1)) {
    const dist = distanceKm(p, d);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best.name;
}

export const networkRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/planned-stations', {
    schema: {
      querystring: {
        type: 'object',
        properties: { stations: { type: 'integer', minimum: 1, maximum: 20, default: 9 } },
      },
    },
  }, async (req) => {
    const { stations = 9 } = req.query as { stations?: number };
    const existing = listDevices(true);
    const districts = listDistricts();
    const result = optimizePlacement(stations, existing);

    return {
      effective_radius_km: Math.round(result.effective_radius_km * 100) / 100,
      current: existing.map((d) => ({
        id: d.id,
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        district: d.district,
      })),
      current_coverage: result.coverage_curve[0]?.coverage ?? 0,
      planned: result.placements.map((p) => {
        const { phase, label } = phaseOf(p.order);
        const district = nearestDistrictName(p, districts);
        return {
          order: p.order,
          lat: p.lat,
          lng: p.lng,
          district,
          name: district ? `Планируется · ${district}` : `Планируется · точка ${p.order}`,
          phase,
          phase_label: label,
          coverage_gain: p.gained_weight,
          cumulative_coverage: p.cumulative_coverage,
        };
      }),
      coverage_curve: result.coverage_curve,
      stations_for_90pct: result.stations_for_90pct,
      note: result.note,
    };
  });
};
