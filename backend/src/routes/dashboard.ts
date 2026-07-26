// City-wide aggregates for the dashboard screen.
//
// One endpoint rather than a dozen, because every tile on that screen is a
// different view of the same two tables and the client would otherwise fan out
// into a request storm on load. Each block below maps to one chart:
//
//   kpi            → stat tiles
//   city_series    → line chart, city mean AQI over the window
//   per_station    → grouped bars + sparklines
//   hourly_profile → heatmap, station × hour of day
//   status_split   → donut, share of time in each status
//   weekday_profile→ bars, mean AQI per weekday
//   climate_series → dual-axis line, DHT22 temperature and humidity
//   districts      → ranking table

import type { FastifyPluginAsync } from 'fastify';
import {
  coverageSince,
  hourlyAggregates,
  latestProcessedByDevice,
  listDevices,
  listDistricts,
  processedRange,
  recentAnomalies,
} from '../db/repositories.js';
import { aqiToPm } from '../processing/aqi.js';
import { distanceKm, idw, type IdwSource } from '../processing/idw.js';
import { levelFromAqi, statusFor } from '../processing/status.js';
import { getAirQuality } from '../external/openMeteo.js';
import { parseHourKey } from '../ml/features.js';
import type { StatusLevel } from '../types.js';

// Almaty keeps UTC+5 year round, so a fixed shift is exact here — no DST table
// needed to turn a UTC hour key into the local hour a resident would name.
const LOCAL_UTC_OFFSET_H = 5;

const localHourOf = (utcHour: number): number => (utcHour + LOCAL_UTC_OFFSET_H) % 24;

interface StationHourly {
  id: string;
  name: string;
  district: string | null;
  hours: Array<{ hour: string; aqi: number; temp_c: number | null; humidity: number | null }>;
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/dashboard', {
    schema: {
      querystring: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 14, default: 3 } },
      },
    },
  }, async (req) => {
    const { days = 3 } = req.query as { days?: number };
    const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString();
    const devices = listDevices(true);
    const latest = new Map(latestProcessedByDevice().map((r) => [r.device_id, r]));

    const perStation: StationHourly[] = devices.map((d) => ({
      id: d.id,
      name: d.name,
      district: d.district,
      hours: hourlyAggregates(d.id, since).map((h) => ({
        hour: h.hour,
        aqi: Math.round(h.aqi),
        temp_c: h.temp_c == null ? null : Math.round(h.temp_c * 10) / 10,
        humidity: h.humidity == null ? null : Math.round(h.humidity),
      })),
    }));

    // City series: mean across whatever stations reported in each hour, so a
    // station going offline shifts the confidence (station count) rather than
    // punching a hole in the line.
    const cityByHour = new Map<string, number[]>();
    const climateByHour = new Map<string, { t: number[]; h: number[] }>();
    for (const s of perStation) {
      for (const h of s.hours) {
        const aqiBucket = cityByHour.get(h.hour) ?? [];
        aqiBucket.push(h.aqi);
        cityByHour.set(h.hour, aqiBucket);
        if (h.temp_c != null && h.humidity != null) {
          const bucket = climateByHour.get(h.hour) ?? { t: [], h: [] };
          bucket.t.push(h.temp_c);
          bucket.h.push(h.humidity);
          climateByHour.set(h.hour, bucket);
        }
      }
    }

    const citySeries = [...cityByHour.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, values]) => {
        const aqi = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
        return {
          hour,
          ts: parseHourKey(hour).toISOString(),
          aqi,
          pm25: Math.round(aqiToPm(aqi) * 10) / 10,
          min: Math.min(...values),
          max: Math.max(...values),
          stations: values.length,
        };
      });

    const climateSeries = [...climateByHour.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, b]) => ({
        hour,
        ts: parseHourKey(hour).toISOString(),
        temp_c: Math.round((b.t.reduce((s, v) => s + v, 0) / b.t.length) * 10) / 10,
        humidity: Math.round(b.h.reduce((s, v) => s + v, 0) / b.h.length),
      }));

    // Heatmap: mean AQI per station per local hour of day.
    const hourlyProfile = perStation.map((s) => {
      const buckets: number[][] = Array.from({ length: 24 }, () => []);
      for (const h of s.hours) {
        buckets[localHourOf(parseHourKey(h.hour).getUTCHours())]!.push(h.aqi);
      }
      return {
        station: s.name,
        id: s.id,
        values: buckets.map((b) =>
          b.length ? Math.round(b.reduce((sum, v) => sum + v, 0) / b.length) : null,
        ),
      };
    });

    // Weekday profile, city-wide.
    const weekdayBuckets: number[][] = Array.from({ length: 7 }, () => []);
    for (const point of citySeries) {
      const local = new Date(parseHourKey(point.hour).getTime() + LOCAL_UTC_OFFSET_H * 3_600_000);
      weekdayBuckets[local.getUTCDay()]!.push(point.aqi);
    }
    const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const weekdayProfile = weekdayBuckets.map((b, i) => ({
      day: WEEKDAYS[i]!,
      aqi: b.length ? Math.round(b.reduce((s, v) => s + v, 0) / b.length) : null,
      samples: b.length,
    }));

    // Share of hours spent in each status, city-wide.
    const split: Record<StatusLevel, number> = { good: 0, moderate: 0, bad: 0 };
    for (const point of citySeries) split[levelFromAqi(point.aqi)] += 1;
    const totalHours = citySeries.length || 1;
    const statusSplit = (['good', 'moderate', 'bad'] as StatusLevel[]).map((level) => ({
      status: level,
      hours: split[level],
      share: Math.round((split[level] / totalHours) * 1000) / 10,
    }));

    // Per-station summary + uptime.
    const coverage = new Map(coverageSince(since).map((c) => [c.device_id, c]));
    const expectedHours = days * 24;
    const stationSummary = perStation.map((s) => {
      const values = s.hours.map((h) => h.aqi);
      const reading = latest.get(s.id);
      const cov = coverage.get(s.id);
      const samples = cov?.samples ?? 0;
      return {
        id: s.id,
        name: s.name,
        district: s.district,
        current_aqi: reading ? Math.round(reading.aqi_composite) : null,
        current_status: reading?.status ?? null,
        avg_aqi: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        max_aqi: values.length ? Math.max(...values) : null,
        min_aqi: values.length ? Math.min(...values) : null,
        uptime: Math.min(1, Math.round(((cov?.hours_covered ?? 0) / expectedHours) * 100) / 100),
        samples,
        sparkline: values.slice(-48),
      };
    });

    // District ranking, best air first.
    const sources: IdwSource[] = devices
      .filter((d) => latest.has(d.id))
      .map((d) => ({
        lat: d.lat,
        lng: d.lng,
        device_id: d.id,
        name: d.name,
        value: latest.get(d.id)!.aqi_composite,
      }));

    // A station "belongs" to whichever district centroid is closest. The
    // devices table stores a free-text district label ('Медеу (парк)') that
    // doesn't line up with the official names ('Медеуский'), so matching on
    // geometry is both simpler and correct.
    const allDistricts = listDistricts();
    const districtsWithStation = new Set<string>();
    for (const dev of devices) {
      let nearest: { id: string; d: number } | null = null;
      for (const dist of allDistricts) {
        const km = distanceKm(dev, dist);
        if (!nearest || km < nearest.d) nearest = { id: dist.id, d: km };
      }
      if (nearest) districtsWithStation.add(nearest.id);
    }

    const districtRanking = await Promise.all(
      allDistricts.map(async (d) => {
        const local = idw({ lat: d.lat, lng: d.lng }, sources);
        let pm25: number | null = null;
        try {
          pm25 = (await getAirQuality(d.lat, d.lng)).current.pm2_5;
        } catch {
          /* external layer optional — local estimate still stands */
        }
        const s = statusFor({ aqiComposite: local.value, pm25External: pm25 });
        return {
          id: d.id,
          district: d.name,
          lat: d.lat,
          lng: d.lng,
          status: s.level,
          score: Math.round(s.score),
          aqi_composite: Math.round(local.value),
          pm2_5: pm25 == null ? null : Math.round(pm25 * 10) / 10,
          confidence: Math.round(local.confidence * 100) / 100,
          is_blind_zone: local.is_blind_zone,
          has_own_station: districtsWithStation.has(d.id),
        };
      }),
    );
    districtRanking.sort((a, b) => a.score - b.score);

    const anomalies = recentAnomalies(since);
    const currentValues = [...latest.values()].map((r) => r.aqi_composite);
    const cityAqi = currentValues.length
      ? Math.round(currentValues.reduce((a, b) => a + b, 0) / currentValues.length)
      : null;

    // 24h delta: how the last day compares with the one before it.
    const last24 = citySeries.slice(-24).map((p) => p.aqi);
    const prev24 = citySeries.slice(-48, -24).map((p) => p.aqi);
    const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const last = meanOf(last24);
    const prev = meanOf(prev24);

    return {
      window_days: days,
      generated_at: new Date().toISOString(),
      kpi: {
        city_aqi: cityAqi,
        city_pm25: cityAqi == null ? null : Math.round(aqiToPm(cityAqi) * 10) / 10,
        city_status: cityAqi == null ? null : levelFromAqi(cityAqi),
        stations_total: devices.length,
        stations_online: devices.filter(
          (d) => d.last_seen_at != null && Date.now() - Date.parse(d.last_seen_at) < 15 * 60_000,
        ).length,
        anomalies_window: anomalies.length,
        change_24h_pct:
          last != null && prev != null && prev > 0
            ? Math.round(((last - prev) / prev) * 1000) / 10
            : null,
        best_district: districtRanking[0]?.district ?? null,
        worst_district: districtRanking[districtRanking.length - 1]?.district ?? null,
        avg_uptime:
          stationSummary.length
            ? Math.round(
                (stationSummary.reduce((s, x) => s + x.uptime, 0) / stationSummary.length) * 100,
              )
            : 0,
      },
      city_series: citySeries,
      climate_series: climateSeries,
      per_station: stationSummary,
      hourly_profile: hourlyProfile,
      weekday_profile: weekdayProfile,
      status_split: statusSplit,
      districts: districtRanking,
      anomalies: anomalies.slice(0, 12),
    };
  });

  // Fine-grained history for one metric, used by the dashboard's zoom control.
  app.get('/api/dashboard/station-series', {
    schema: {
      querystring: {
        type: 'object',
        required: ['device_id'],
        properties: {
          device_id: { type: 'string' },
          hours: { type: 'integer', minimum: 1, maximum: 336, default: 24 },
        },
      },
    },
  }, async (req) => {
    const { device_id, hours = 24 } = req.query as { device_id: string; hours?: number };
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3_600_000);
    const rows = processedRange(device_id, from.toISOString(), to.toISOString());
    return {
      device_id,
      hours,
      points: rows.map((r) => ({
        ts: r.ts,
        aqi: Math.round(r.aqi_composite),
        mq2_ppm: r.mq2_ppm,
        mq4_ppm: r.mq4_ppm,
        mq8_ppm: r.mq8_ppm,
        status: r.status,
      })),
    };
  });
};
