// Schema migrations for databases created before a column existed.
//
// schema.sql only ever runs `CREATE TABLE IF NOT EXISTS`, so an existing file
// keeps its original shape forever. These steps bring it forward. Each one is
// idempotent and checks the live schema rather than a version counter — with a
// single-file SQLite database that is both simpler and harder to get wrong than
// tracking migration numbers.

import type { DB } from './client.js';

interface ColumnInfo {
  name: string;
  notnull: number;
}

function columns(db: DB, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[];
}

function hasColumn(db: DB, table: string, column: string): boolean {
  return columns(db, table).some((c) => c.name === column);
}

function addColumn(db: DB, table: string, definition: string, name: string): void {
  if (hasColumn(db, table, name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

/**
 * Gas channels started out NOT NULL, which forced every device to report all
 * three MQ elements. An MQ-135 station has one, so the columns had to become
 * nullable — and SQLite cannot drop a NOT NULL constraint in place, hence the
 * copy-and-swap. Run inside a transaction so a failure leaves the original
 * table untouched.
 */
function relaxGasColumns(db: DB): void {
  const raw = columns(db, 'readings_raw');
  if (raw.length === 0) return; // fresh database, schema.sql already correct
  const needsRebuild = raw.some((c) => c.name === 'mq2_adc' && c.notnull === 1);
  if (!needsRebuild) return;

  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE readings_raw_new (
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        ts        TEXT NOT NULL,
        mq2_adc   INTEGER,
        mq4_adc   INTEGER,
        mq8_adc   INTEGER,
        mq135_adc INTEGER,
        temp_c    REAL,
        humidity  REAL,
        vcc_mv    INTEGER,
        PRIMARY KEY (device_id, ts)
      );
      INSERT INTO readings_raw_new
        (device_id, ts, mq2_adc, mq4_adc, mq8_adc, temp_c, humidity, vcc_mv)
        SELECT device_id, ts, mq2_adc, mq4_adc, mq8_adc, temp_c, humidity, vcc_mv
          FROM readings_raw;
      DROP TABLE readings_raw;
      ALTER TABLE readings_raw_new RENAME TO readings_raw;
      CREATE INDEX IF NOT EXISTS idx_raw_ts ON readings_raw(ts);

      CREATE TABLE readings_processed_new (
        device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        ts            TEXT NOT NULL,
        mq2_ppm       REAL,
        mq4_ppm       REAL,
        mq8_ppm       REAL,
        mq135_ppm     REAL,
        aqi_composite REAL NOT NULL,
        status        TEXT NOT NULL CHECK (status IN ('good','moderate','bad')),
        quality_flag  TEXT NOT NULL,
        PRIMARY KEY (device_id, ts)
      );
      INSERT INTO readings_processed_new
        (device_id, ts, mq2_ppm, mq4_ppm, mq8_ppm, aqi_composite, status, quality_flag)
        SELECT device_id, ts, mq2_ppm, mq4_ppm, mq8_ppm, aqi_composite, status, quality_flag
          FROM readings_processed;
      DROP TABLE readings_processed;
      ALTER TABLE readings_processed_new RENAME TO readings_processed;
      CREATE INDEX IF NOT EXISTS idx_proc_ts ON readings_processed(ts);
    `);
    db.exec('COMMIT');
    console.log('[migrate] gas channels are now nullable (MQ-135 support)');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function migrate(db: DB): void {
  addColumn(db, 'devices', "sensor_kind TEXT NOT NULL DEFAULT 'mq_trio'", 'sensor_kind');
  addColumn(db, 'devices', 'is_demo INTEGER NOT NULL DEFAULT 0', 'is_demo');
  addColumn(db, 'devices', 'r0_mq135 REAL NOT NULL DEFAULT 10000', 'r0_mq135');
  relaxGasColumns(db);
}
