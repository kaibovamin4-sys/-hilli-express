// Station endpoints — everything the app shows about one physical box.
//
// /api/stations       list + latest reading + DHT22 + health, one call
// /api/stations/:id   detail: derived climate, 24h series, per-gas breakdown,
//                     health factors, recent anomalies
//
// The list is deliberately fat: the stations screen and the map both need the
// same joined shape, and six stations of joined data is far cheaper than the
// six round-trips the client would otherwise make per station.

import type { FastifyPluginAsync } from 'fastify';
import {
  coverageSince,
  getDevice,
  latestForDevice,
  latestProcessedByDevice,
  latestRawForDevice,
  listDevices,
  processedRange,
  rawRange,
  recentAnomalies,
} from '../db/repositories.js';
import { deriveClimate } from '../processing/climate.js';
import { computeAqi, aqiToPm } from '../processing/aqi.js';
import { computeSensorHealth } from '../analytics/sensorHealth.js';
import { classify } from '../analytics/classifier.js';
import type { Device, ProcessedReading, RawReading, StatusLevel } from '../types.js';

const OFFLINE_AFTER_MS = 15 * 60_000;

function onlineState(lastSeen: string | null): { online: boolean; minutes_ago: number | null } {
  if (!lastSeen) return { online: false, minutes_ago: null };
  const ms = Date.now() - Date.parse(lastSeen);
  return { online: ms <= OFFLINE_AFTER_MS, minutes_ago: Math.round(ms / 60_000) };
}

function climateOf(raw: RawReading | null) {
  if (!raw || raw.temp_c == null || raw.humidity == null) return null;
  return { ...deriveClimate(raw.temp_c, raw.humidity), ts: raw.ts, sensor: 'DHT22' as const };
}

/**
 * What is physically on the board. Derived from `sensor_kind` plus whether the
 * device is actually sending temperature — DHT22 is fitted to some stations and
 * not others, so its presence is a fact about the data, not about the model.
 */
function hardwareOf(device: Device, latestRaw: RawReading | null) {
  const trio = device.sensor_kind === 'mq_trio';
  return {
    board: 'ESP8266',
    gas_sensors: trio ? ['MQ2', 'MQ4', 'MQ8'] : ['MQ-135'],
    climate_sensor: latestRaw?.temp_c != null ? 'DHT22' : null,
    // The station drives its own indicator from the same threshold, with the
    // logic burned into the firmware — so it answers without a phone, an app or
    // any internet at all.
    has_led_indicator: true,
    vcc_mv: device.vcc_mv,
    rl_ohm: device.rl_ohm,
    r0: trio
      ? { mq2: device.r0_mq2, mq4: device.r0_mq4, mq8: device.r0_mq8 }
      : { mq135: device.r0_mq135 },
  };
}

/** Colour the on-board LED is showing right now: green = go out, red = stay in. */
function ledOf(status: StatusLevel | null): 'green' | 'red' | 'off' {
  if (status === null) return 'off';
  return status === 'good' ? 'green' : 'red';
}

export const stationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/stations', async () => {
    const devices = listDevices(true);
    const latest = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));
    const coverage = new Map(
      coverageSince(new Date(Date.now() - 24 * 3_600_000).toISOString()).map((c) => [c.device_id, c]),
    );

    return {
      stations: devices.map((d) => {
        const reading = latest.get(d.id) ?? null;
        const raw = latestRawForDevice(d.id);
        const health = computeSensorHealth(d.id);
        return {
          id: d.id,
          name: d.name,
          lat: d.lat,
          lng: d.lng,
          district: d.district,
          sensor_kind: d.sensor_kind,
          is_demo: d.is_demo === 1,
          firmware: d.firmware,
          installed_at: d.installed_at,
          last_seen_at: d.last_seen_at,
          ...onlineState(d.last_seen_at),
          led: ledOf(reading?.status ?? null),
          reading: reading
            ? {
                ts: reading.ts,
                aqi_composite: Math.round(reading.aqi_composite),
                pm25_equivalent: Math.round(aqiToPm(reading.aqi_composite) * 10) / 10,
                status: reading.status,
                quality_flag: reading.quality_flag,
                mq2_ppm: reading.mq2_ppm,
                mq4_ppm: reading.mq4_ppm,
                mq8_ppm: reading.mq8_ppm,
                mq135_ppm: reading.mq135_ppm,
              }
            : null,
          climate: climateOf(raw),
          health: health ? { score: health.score, status: health.status } : null,
          samples_24h: coverage.get(d.id)?.samples ?? 0,
        };
      }),
    };
  });

  app.get('/api/stations/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: { hours: { type: 'integer', minimum: 1, maximum: 168, default: 24 } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { hours = 24 } = req.query as { hours?: number };
    const device = getDevice(id);
    if (!device) return reply.code(404).send({ error: 'unknown_device' });

    const to = new Date();
    const from = new Date(to.getTime() - hours * 3_600_000);
    const processed = processedRange(id, from.toISOString(), to.toISOString());
    const raws = rawRange(id, from.toISOString(), to.toISOString());
    const latest = latestForDevice(id);
    const latestRaw = latestRawForDevice(id);

    // Down-sample to at most ~120 points so a week of 30-second samples doesn't
    // ship 20k rows to a phone that can only draw a few hundred pixels wide.
    const series = downsample(processed, raws, 120);

    const anomalies = recentAnomalies(new Date(to.getTime() - 24 * 3_600_000).toISOString())
      .filter((a) => a.device_id === id)
      .slice(0, 10);

    const breakdown = latest
      ? computeAqi({
          mq2_ppm: latest.mq2_ppm,
          mq4_ppm: latest.mq4_ppm,
          mq8_ppm: latest.mq8_ppm,
          mq135_ppm: latest.mq135_ppm,
        })
      : null;

    // Event fingerprint: what kind of source the current excursion looks like.
    const nowMs = to.getTime();
    const event = classify({
      recent: processedRange(id, new Date(nowMs - 15 * 60_000).toISOString(), to.toISOString()),
      baseline: processedRange(
        id,
        new Date(nowMs - 3 * 3_600_000).toISOString(),
        new Date(nowMs - 15 * 60_000).toISOString(),
      ),
    });

    return {
      station: {
        id: device.id,
        name: device.name,
        lat: device.lat,
        lng: device.lng,
        district: device.district,
        sensor_kind: device.sensor_kind,
        is_demo: device.is_demo === 1,
        firmware: device.firmware,
        installed_at: device.installed_at,
        last_seen_at: device.last_seen_at,
        ...onlineState(device.last_seen_at),
        led: ledOf(latest?.status ?? null),
        hardware: hardwareOf(device, latestRaw),
      },
      reading: latest
        ? {
            ts: latest.ts,
            aqi_composite: Math.round(latest.aqi_composite),
            pm25_equivalent: Math.round(aqiToPm(latest.aqi_composite) * 10) / 10,
            status: latest.status,
            quality_flag: latest.quality_flag,
            mq2_ppm: latest.mq2_ppm,
            mq4_ppm: latest.mq4_ppm,
            mq8_ppm: latest.mq8_ppm,
            mq135_ppm: latest.mq135_ppm,
            breakdown,
          }
        : null,
      climate: climateOf(latestRaw),
      raw_adc: latestRaw
        ? {
            ts: latestRaw.ts,
            mq2_adc: latestRaw.mq2_adc,
            mq4_adc: latestRaw.mq4_adc,
            mq8_adc: latestRaw.mq8_adc,
            mq135_adc: latestRaw.mq135_adc,
            vcc_mv: latestRaw.vcc_mv,
          }
        : null,
      health: computeSensorHealth(id),
      event,
      anomalies,
      window_hours: hours,
      series,
      stats: seriesStats(processed, raws),
    };
  });
};

export interface SeriesPoint {
  ts: string;
  aqi: number;
  mq2_ppm: number | null;
  mq4_ppm: number | null;
  mq8_ppm: number | null;
  mq135_ppm: number | null;
  temp_c: number | null;
  humidity: number | null;
  dew_point_c: number | null;
}

function downsample(processed: ProcessedReading[], raws: RawReading[], maxPoints: number): SeriesPoint[] {
  if (processed.length === 0) return [];
  const rawByTs = new Map(raws.map((r) => [r.ts, r]));
  const stride = Math.max(1, Math.ceil(processed.length / maxPoints));
  const out: SeriesPoint[] = [];

  for (let i = 0; i < processed.length; i += stride) {
    const bucket = processed.slice(i, i + stride);
    // Averages only the samples that carry the channel, and returns null when
    // none do — so an absent element stays a gap in the chart instead of a
    // line pinned to zero.
    const avg = (pick: (r: ProcessedReading) => number | null): number | null => {
      const values = bucket.map(pick).filter((v): v is number => v != null);
      if (values.length === 0) return null;
      return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
    };

    const climate = bucket
      .map((r) => rawByTs.get(r.ts))
      .filter((r): r is RawReading => r != null && r.temp_c != null && r.humidity != null);
    const temp = climate.length
      ? Math.round((climate.reduce((s, r) => s + r.temp_c!, 0) / climate.length) * 10) / 10
      : null;
    const hum = climate.length
      ? Math.round(climate.reduce((s, r) => s + r.humidity!, 0) / climate.length)
      : null;

    out.push({
      // Label the bucket by its last sample so the newest point on the chart
      // sits at "now" instead of one stride in the past.
      ts: bucket[bucket.length - 1]!.ts,
      aqi: Math.round(avg((r) => r.aqi_composite) ?? 0),
      mq2_ppm: avg((r) => r.mq2_ppm),
      mq4_ppm: avg((r) => r.mq4_ppm),
      mq8_ppm: avg((r) => r.mq8_ppm),
      mq135_ppm: avg((r) => r.mq135_ppm),
      temp_c: temp,
      humidity: hum,
      dew_point_c: temp != null && hum != null ? Math.round(deriveClimate(temp, hum).dew_point_c * 10) / 10 : null,
    });
  }
  return out;
}

function seriesStats(processed: ProcessedReading[], raws: RawReading[]) {
  const agg = (values: number[]) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      min: Math.round(sorted[0]! * 10) / 10,
      max: Math.round(sorted[sorted.length - 1]! * 10) / 10,
      avg: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
      median: Math.round(sorted[Math.floor(sorted.length / 2)]! * 10) / 10,
    };
  };
  const temps = raws.map((r) => r.temp_c).filter((v): v is number => v != null);
  const hums = raws.map((r) => r.humidity).filter((v): v is number => v != null);

  return {
    aqi: agg(processed.map((r) => r.aqi_composite)),
    temp_c: agg(temps),
    humidity: agg(hums),
    samples: processed.length,
    // Counts of readings, not hours — the sampling interval varies between
    // seeded history and live ingest, so only the sample count is meaningful.
    samples_bad: processed.filter((r) => r.status === 'bad').length,
    samples_good: processed.filter((r) => r.status === 'good').length,
  };
}
