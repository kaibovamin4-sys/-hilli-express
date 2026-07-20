// Data access layer. Isolates SQL/binding details from the rest of the app.
//
// node:sqlite binding notes:
//   • named params in SQL use `:name` (or `@name`, `$name`); pass a plain
//     object to `.run` / `.get` / `.all`;
//   • `null` maps to SQL NULL; numbers/strings map naturally;
//   • booleans are NOT supported → we store `active` as INTEGER 0/1.

import type { Device, RawReading, ProcessedReading, AnomalyEvent } from '../types.js';
import { getDb, bool01 } from './client.js';

// ─── Devices ──────────────────────────────────────────────────────────────

export function upsertDevice(d: Device): void {
  getDb()
    .prepare(
      `INSERT INTO devices (id, name, lat, lng, district, r0_mq2, r0_mq4, r0_mq8,
                            vcc_mv, rl_ohm, firmware, installed_at, last_seen_at, active)
       VALUES (:id, :name, :lat, :lng, :district, :r0_mq2, :r0_mq4, :r0_mq8,
               :vcc_mv, :rl_ohm, :firmware, :installed_at, :last_seen_at, :active)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, lat=excluded.lat, lng=excluded.lng, district=excluded.district,
         r0_mq2=excluded.r0_mq2, r0_mq4=excluded.r0_mq4, r0_mq8=excluded.r0_mq8,
         vcc_mv=excluded.vcc_mv, rl_ohm=excluded.rl_ohm, active=excluded.active`,
    )
    .run({
      id: d.id, name: d.name, lat: d.lat, lng: d.lng,
      district: d.district ?? null,
      r0_mq2: d.r0_mq2, r0_mq4: d.r0_mq4, r0_mq8: d.r0_mq8,
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

export function updateR0(id: string, r0_mq2: number, r0_mq4: number, r0_mq8: number): void {
  getDb()
    .prepare('UPDATE devices SET r0_mq2 = ?, r0_mq4 = ?, r0_mq8 = ? WHERE id = ?')
    .run(r0_mq2, r0_mq4, r0_mq8, id);
}

// ─── Raw readings ─────────────────────────────────────────────────────────

const rawInsertSql = `INSERT OR IGNORE INTO readings_raw
  (device_id, ts, mq2_adc, mq4_adc, mq8_adc, temp_c, humidity, vcc_mv)
  VALUES (:device_id, :ts, :mq2_adc, :mq4_adc, :mq8_adc, :temp_c, :humidity, :vcc_mv)`;

function rawParams(r: RawReading): Record<string, string | number | null> {
  return {
    device_id: r.device_id,
    ts: r.ts,
    mq2_adc: r.mq2_adc,
    mq4_adc: r.mq4_adc,
    mq8_adc: r.mq8_adc,
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

// ─── Processed readings ───────────────────────────────────────────────────

const procInsertSql = `INSERT OR REPLACE INTO readings_processed
  (device_id, ts, mq2_ppm, mq4_ppm, mq8_ppm, aqi_composite, status, quality_flag)
  VALUES (:device_id, :ts, :mq2_ppm, :mq4_ppm, :mq8_ppm, :aqi_composite, :status, :quality_flag)`;

function procParams(r: ProcessedReading): Record<string, string | number> {
  return {
    device_id: r.device_id,
    ts: r.ts,
    mq2_ppm: r.mq2_ppm,
    mq4_ppm: r.mq4_ppm,
    mq8_ppm: r.mq8_ppm,
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

// ─── Anomalies ────────────────────────────────────────────────────────────

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

// ─── Districts ────────────────────────────────────────────────────────────

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
