// /api/accuracy — how well our network agrees with the outside reference.
//
// Joins the archived reference PM2.5 to our own hourly estimate for the same
// hour and reports the gap. Deliberately unflattering by construction: bias is
// signed so a network that reads consistently low cannot hide it behind an
// absolute error, and the response always states which source it was compared
// against, because agreeing with a model is a much weaker claim than agreeing
// with a reference-grade station.

import type { FastifyPluginAsync } from 'fastify';
import {
  hourlyAggregates,
  listDevices,
  referenceHourly,
  referenceMeta,
} from '../db/repositories.js';
import { aqiToPm } from '../processing/aqi.js';

interface Paired {
  hour: string;
  ours: number;
  reference: number;
  diff: number;
}

export const accuracyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/accuracy', {
    schema: {
      querystring: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 30, default: 7 } },
      },
    },
  }, async (req) => {
    const { days = 7 } = req.query as { days?: number };
    const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString();

    const meta = referenceMeta();
    const reference = new Map(referenceHourly(since).map((r) => [r.hour, r]));

    // Our city-wide estimate per hour: mean composite across reporting
    // stations, converted to the PM2.5 scale the reference speaks in.
    const ourHours = new Map<string, number[]>();
    for (const d of listDevices(true)) {
      for (const h of hourlyAggregates(d.id, since)) {
        const bucket = ourHours.get(h.hour) ?? [];
        bucket.push(aqiToPm(h.aqi));
        ourHours.set(h.hour, bucket);
      }
    }

    const paired: Paired[] = [];
    for (const [hour, values] of ourHours) {
      const ref = reference.get(hour);
      if (!ref || ref.pm2_5 == null) continue;
      const ours = values.reduce((s, v) => s + v, 0) / values.length;
      paired.push({
        hour,
        ours: Math.round(ours * 10) / 10,
        reference: Math.round(ref.pm2_5 * 10) / 10,
        diff: Math.round((ours - ref.pm2_5) * 10) / 10,
      });
    }
    paired.sort((a, b) => a.hour.localeCompare(b.hour));

    return {
      window_days: days,
      // A model is not ground truth, and the UI must be able to say so.
      reference_source: meta.source,
      reference_kind: meta.kind,
      is_ground_truth: meta.kind === 'station',
      archive_rows: meta.rows,
      archive_since: meta.first_ts,
      paired_hours: paired.length,
      metrics: metricsFor(paired),
      series: paired,
    };
  });
};

function metricsFor(paired: Paired[]) {
  if (paired.length === 0) {
    return { mae: null, bias: null, rmse: null, correlation: null, within_5: null, within_10: null };
  }
  const n = paired.length;
  const mae = paired.reduce((s, p) => s + Math.abs(p.diff), 0) / n;
  const bias = paired.reduce((s, p) => s + p.diff, 0) / n;
  const rmse = Math.sqrt(paired.reduce((s, p) => s + p.diff * p.diff, 0) / n);

  const meanOurs = paired.reduce((s, p) => s + p.ours, 0) / n;
  const meanRef = paired.reduce((s, p) => s + p.reference, 0) / n;
  let cov = 0;
  let varOurs = 0;
  let varRef = 0;
  for (const p of paired) {
    const a = p.ours - meanOurs;
    const b = p.reference - meanRef;
    cov += a * b;
    varOurs += a * a;
    varRef += b * b;
  }
  const denom = Math.sqrt(varOurs * varRef);

  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    mae: round(mae),
    bias: round(bias),
    rmse: round(rmse),
    correlation: denom > 0 ? round(cov / denom) : null,
    // Share of hours landing inside a tolerance — easier to act on than an
    // average, since it says how often the reading is usable, not by how much
    // it misses on a bad day.
    within_5: Math.round((paired.filter((p) => Math.abs(p.diff) <= 5).length / n) * 1000) / 10,
    within_10: Math.round((paired.filter((p) => Math.abs(p.diff) <= 10).length / n) * 1000) / 10,
  };
}
