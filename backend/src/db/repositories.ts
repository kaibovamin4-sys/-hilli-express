// Data access layer. All SQL lives here so the rest of the app never touches
// the database directly.
//
// node:sqlite binding notes: named params use `:name`; pass a plain object to
// run/get/all. `null` maps to SQL NULL. Booleans are not supported, so the
// `active` flag is stored as INTEGER 0/1 (see bool01 in client.ts).

import type { Device, RawReading, ProcessedReading, Mq135AirReading, AnomalyEvent } from '../types.js';
import { getDb, bool01 } from './client.js';

// Devices

export function upsertDevice(d: Device): void {
  getDb()
    .prepare(
      `INSERT INTO devices (id, name, lat, lng, district, sensor_kind, is_demo,
                            r0_mq2, r0_mq4, r0_mq8, r0_mq135,
                            vcc_mv, rl_ohm, firmware, installed_at, last_seen_at, active)
       VALUES (:id, :name, :lat, :lng, :district, :sensor_kind, :is_demo,
               :r0_mq2, :r0_mq4, :r0_mq8, :r0_mq135,
               :vcc_mv, :rl_ohm, :firmware, :installed_at, :last_seen_at, :active)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, lat=excluded.lat, lng=excluded.lng, district=excluded.district,
         sensor_kind=excluded.sensor_kind, is_demo=excluded.is_demo,
         r0_mq2=excluded.r0_mq2, r0_mq4=excluded.r0_mq4, r0_mq8=excluded.r0_mq8,
         r0_mq135=excluded.r0_mq135,
         vcc_mv=excluded.vcc_mv, rl_ohm=excluded.rl_ohm, active=excluded.active`,
    )
    .run({
      id: d.id, name: d.name, lat: d.lat, lng: d.lng,
      district: d.district ?? null,
      sensor_kind: d.sensor_kind,
      is_demo: bool01(d.is_demo),
      r0_mq2: d.r0_mq2, r0_mq4: d.r0_mq4, r0_mq8: d.r0_mq8, r0_mq135: d.r0_mq135,
      vcc_mv: d.vcc_mv, rl_ohm: d.rl_ohm,
      firmware: d.firmware ?? null,
      installed_at: d.installed_at,
      last_seen_at: d.last_seen_at ?? null,
      active: bool01(d.active),
    });
}

export function listDevices(activeOnly = true): Device[] {
  const sql = activeOnly
    ? 'SELECT * FROM devices WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM devices ORDER BY name';
  return getDb().prepare(sql).all() as unknown as Device[];
}

export function getDevice(id: string): Device | null {
  return (getDb().prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined) ?? null;
}

export function touchDeviceSeen(id: string, ts: string): void {
  getDb().prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(ts, id);
}

export interface R0Set {
  r0_mq2: number;
  r0_mq4: number;
  r0_mq8: number;
  r0_mq135: number;
}

export function updateR0(id: string, r0: R0Set): void {
  getDb()
    .prepare('UPDATE devices SET r0_mq2 = ?, r0_mq4 = ?, r0_mq8 = ?, r0_mq135 = ? WHERE id = ?')
    .run(r0.r0_mq2, r0.r0_mq4, r0.r0_mq8, r0.r0_mq135, id);
}

// Raw readings

const rawInsertSql = `INSERT OR IGNORE INTO readings_raw
  (device_id, ts, mq2_adc, mq4_adc, mq8_adc, mq135_adc, temp_c, humidity, vcc_mv)
  VALUES (:device_id, :ts, :mq2_adc, :mq4_adc, :mq8_adc, :mq135_adc, :temp_c, :humidity, :vcc_mv)`;

function rawParams(r: RawReading): Record<string, string | number | null> {
  return {
    device_id: r.device_id,
    ts: r.ts,
    mq2_adc: r.mq2_adc,
    mq4_adc: r.mq4_adc,
    mq8_adc: r.mq8_adc,
    mq135_adc: r.mq135_adc,
    temp_c: r.temp_c,
    humidity: r.humidity,
    vcc_mv: r.vcc_mv,
  };
}

export function insertRaw(r: RawReading): void {
  getDb().prepare(rawInsertSql).run(rawParams(r));
}

export function insertRawBatch(rows: RawReading[]): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(rawInsertSql);
  db.exec('BEGIN');
  try {
    for (const row of rows) stmt.run(rawParams(row));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getRecentRaw(deviceId: string, sinceIso: string): RawReading[] {
  return getDb()
    .prepare('SELECT * FROM readings_raw WHERE device_id = ? AND ts >= ? ORDER BY ts')
    .all(deviceId, sinceIso) as unknown as RawReading[];
}

// Processed readings

const procInsertSql = `INSERT OR REPLACE INTO readings_processed
  (device_id, ts, mq2_ppm, mq4_ppm, mq8_ppm, mq135_ppm, aqi_composite, status, quality_flag)
  VALUES (:device_id, :ts, :mq2_ppm, :mq4_ppm, :mq8_ppm, :mq135_ppm, :aqi_composite, :status, :quality_flag)`;

function procParams(r: ProcessedReading): Record<string, string | number | null> {
  return {
    device_id: r.device_id,
    ts: r.ts,
    mq2_ppm: r.mq2_ppm,
    mq4_ppm: r.mq4_ppm,
    mq8_ppm: r.mq8_ppm,
    mq135_ppm: r.mq135_ppm,
    aqi_composite: r.aqi_composite,
    status: r.status,
    quality_flag: r.quality_flag,
  };
}

export function insertProcessed(r: ProcessedReading): void {
  getDb().prepare(procInsertSql).run(procParams(r));
}

export function insertProcessedBatch(rows: ProcessedReading[]): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(procInsertSql);
  db.exec('BEGIN');
  try {
    for (const row of rows) stmt.run(procParams(row));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function latestProcessedByDevice(): ProcessedReading[] {
  return getDb()
    .prepare(
      `SELECT p.* FROM readings_processed p
       JOIN (SELECT device_id, MAX(ts) AS max_ts
             FROM readings_processed GROUP BY device_id) m
       ON p.device_id = m.device_id AND p.ts = m.max_ts`,
    )
    .all() as unknown as ProcessedReading[];
}

export function latestForDevice(deviceId: string): ProcessedReading | null {
  return (
    (getDb()
      .prepare('SELECT * FROM readings_processed WHERE device_id = ? ORDER BY ts DESC LIMIT 1')
      .get(deviceId) as ProcessedReading | undefined) ?? null
  );
}

export function processedRange(deviceId: string, fromIso: string, toIso: string): ProcessedReading[] {
  return getDb()
    .prepare(
      'SELECT * FROM readings_processed WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts',
    )
    .all(deviceId, fromIso, toIso) as unknown as ProcessedReading[];
}

/**
 * One row per whole hour, averaging the processed gas channels together with
 * the DHT22 temperature/humidity recorded alongside them. This is the shape
 * the forecast model trains on: raw 30-second samples are far denser than the
 * hourly weather covariates they get joined to, and averaging first keeps the
 * sensor noise from being learned as signal.
 *
 * `hour` is a UTC key (`YYYY-MM-DDTHH:00`) because `ts` is stored as ISO-8601
 * with a Z suffix, so every consumer must convert local labels to UTC to join.
 */
export interface HourlyAggregate {
  hour: string;
  aqi: number;
  // Channels the device does not carry collapse to 0 here: the forecast model
  // needs a dense numeric matrix, and "absent" is a constant per station that
  // its own lag features already encode.
  mq2: number;
  mq4: number;
  mq8: number;
  mq135: number;
  temp_c: number | null;
  humidity: number | null;
  samples: number;
}

export function hourlyAggregates(deviceId: string, sinceIso: string): HourlyAggregate[] {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00', p.ts)   AS hour,
              AVG(p.aqi_composite)               AS aqi,
              COALESCE(AVG(p.mq2_ppm), 0)        AS mq2,
              COALESCE(AVG(p.mq4_ppm), 0)        AS mq4,
              COALESCE(AVG(p.mq8_ppm), 0)        AS mq8,
              COALESCE(AVG(p.mq135_ppm), 0)      AS mq135,
              AVG(r.temp_c)                      AS temp_c,
              AVG(r.humidity)                    AS humidity,
              COUNT(*)                           AS samples
         FROM readings_processed p
         LEFT JOIN readings_raw r
           ON r.device_id = p.device_id AND r.ts = p.ts
        WHERE p.device_id = ? AND p.ts >= ?
        GROUP BY hour
        ORDER BY hour`,
    )
    .all(deviceId, sinceIso) as unknown as HourlyAggregate[];
}

/** Latest raw sample — the DHT22 reading shown on a station card. */
export function latestRawForDevice(deviceId: string): RawReading | null {
  return (
    (getDb()
      .prepare('SELECT * FROM readings_raw WHERE device_id = ? ORDER BY ts DESC LIMIT 1')
      .get(deviceId) as RawReading | undefined) ?? null
  );
}

export function rawRange(deviceId: string, fromIso: string, toIso: string): RawReading[] {
  return getDb()
    .prepare('SELECT * FROM readings_raw WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts')
    .all(deviceId, fromIso, toIso) as unknown as RawReading[];
}

export interface DeviceCoverage {
  device_id: string;
  samples: number;
  /**
   * Distinct hours that contain at least one reading. Uptime is derived from
   * this rather than from `samples / expected`, because the sampling interval
   * is not constant — seeded history is 5-minutely while live ingest is every
   * 30 seconds, so a ratio against a fixed cadence reports a perfectly healthy
   * station as 10% up. "Did data arrive during this hour" is both the honest
   * question and the one that survives a change of interval.
   */
  hours_covered: number;
  first_ts: string | null;
  last_ts: string | null;
}

export function coverageSince(sinceIso: string): DeviceCoverage[] {
  return getDb()
    .prepare(
      `SELECT device_id,
              COUNT(*)                                        AS samples,
              COUNT(DISTINCT strftime('%Y-%m-%dT%H', ts))     AS hours_covered,
              MIN(ts)                                         AS first_ts,
              MAX(ts)                                         AS last_ts
         FROM readings_processed
        WHERE ts >= ?
        GROUP BY device_id`,
    )
    .all(sinceIso) as unknown as DeviceCoverage[];
}

/** Distinct hours with a raw packet — the uptime input for sensor health. */
export function rawHoursCovered(deviceId: string, sinceIso: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT strftime('%Y-%m-%dT%H', ts)) AS n
         FROM readings_raw WHERE device_id = ? AND ts >= ?`,
    )
    .get(deviceId, sinceIso) as { n: number };
  return row.n;
}

// MQ-135 air readings from MQTT

export function insertMq135AirReading(r: Mq135AirReading): number {
  const info = getDb()
    .prepare(
      `INSERT INTO mq135_air_readings
        (ts, topic, location, raw_adc, voltage, quality_percent, status)
       VALUES
        (:ts, :topic, :location, :raw_adc, :voltage, :quality_percent, :status)`,
    )
    .run({
      ts: r.ts,
      topic: r.topic,
      location: r.location,
      raw_adc: r.raw_adc,
      voltage: r.voltage,
      quality_percent: r.quality_percent,
      status: r.status,
    });
  return Number(info.lastInsertRowid);
}

export function latestMq135AirReadings(limit = 1): Mq135AirReading[] {
  return getDb()
    .prepare('SELECT * FROM mq135_air_readings ORDER BY ts DESC, id DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, limit))) as unknown as Mq135AirReading[];
}

// Reference readings (accuracy archive)

export interface ReferenceRow {
  id?: number;
  source: string;
  kind: 'station' | 'model';
  station_ref: string | null;
  lat: number;
  lng: number;
  ts: string;
  pm2_5: number | null;
  pm10: number | null;
}

/**
 * `INSERT OR IGNORE` against the (source, station_ref, ts) unique key: polling
 * more often than the reference publishes is normal and must not create
 * duplicate hours that would then be double-counted in the agreement stats.
 */
export function insertReferenceBatch(rows: ReferenceRow[]): number {
  if (rows.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO reference_readings
       (source, kind, station_ref, lat, lng, ts, pm2_5, pm10)
     VALUES (:source, :kind, :station_ref, :lat, :lng, :ts, :pm2_5, :pm10)`,
  );
  let inserted = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const info = stmt.run({
        source: r.source,
        kind: r.kind,
        station_ref: r.station_ref,
        lat: r.lat,
        lng: r.lng,
        ts: r.ts,
        pm2_5: r.pm2_5,
        pm10: r.pm10,
      });
      inserted += Number(info.changes);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return inserted;
}

/** Hourly mean of the reference archive, whatever stations reported that hour. */
export interface ReferenceHour {
  hour: string;
  pm2_5: number;
  sources: number;
}

export function referenceHourly(sinceIso: string): ReferenceHour[] {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00', ts)        AS hour,
              AVG(pm2_5)                            AS pm2_5,
              COUNT(DISTINCT station_ref)           AS sources
         FROM reference_readings
        WHERE ts >= ? AND pm2_5 IS NOT NULL
        GROUP BY hour
        ORDER BY hour`,
    )
    .all(sinceIso) as unknown as ReferenceHour[];
}

export function referenceMeta(): { source: string | null; kind: string | null; rows: number; first_ts: string | null } {
  const row = getDb()
    .prepare(
      `SELECT source, kind, COUNT(*) AS rows, MIN(ts) AS first_ts
         FROM reference_readings
        GROUP BY source, kind
        ORDER BY rows DESC LIMIT 1`,
    )
    .get() as { source: string; kind: string; rows: number; first_ts: string } | undefined;
  return row
    ? { source: row.source, kind: row.kind, rows: row.rows, first_ts: row.first_ts }
    : { source: null, kind: null, rows: 0, first_ts: null };
}

// Anomalies

export function insertAnomaly(a: AnomalyEvent): number {
  const info = getDb()
    .prepare(
      `INSERT INTO anomalies (device_id, metric, ts_start, ts_end, peak_value, severity)
       VALUES (:device_id, :metric, :ts_start, :ts_end, :peak_value, :severity)`,
    )
    .run({
      device_id: a.device_id,
      metric: a.metric,
      ts_start: a.ts_start,
      ts_end: a.ts_end,
      peak_value: a.peak_value,
      severity: a.severity,
    });
  return Number(info.lastInsertRowid);
}

export function recentAnomalies(sinceIso: string): AnomalyEvent[] {
  return getDb()
    .prepare('SELECT * FROM anomalies WHERE ts_end >= ? ORDER BY ts_start DESC LIMIT 200')
    .all(sinceIso) as unknown as AnomalyEvent[];
}

// Districts

export interface DistrictRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export function upsertDistrict(d: DistrictRow): void {
  getDb()
    .prepare(
      `INSERT INTO districts (id, name, lat, lng)
       VALUES (:id, :name, :lat, :lng)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, lat=excluded.lat, lng=excluded.lng`,
    )
    .run({ id: d.id, name: d.name, lat: d.lat, lng: d.lng });
}

export function listDistricts(): DistrictRow[] {
  return getDb().prepare('SELECT * FROM districts ORDER BY name').all() as unknown as DistrictRow[];
}
