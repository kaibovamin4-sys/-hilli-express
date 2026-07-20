-- AUA schema (SQLite / better-sqlite3).
-- Product invariants are enforced here rather than in application code,
-- so a corrupted client can never violate them.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  district     TEXT,
  r0_mq2       REAL NOT NULL DEFAULT 10000,
  r0_mq4       REAL NOT NULL DEFAULT 10000,
  r0_mq8       REAL NOT NULL DEFAULT 10000,
  vcc_mv       INTEGER NOT NULL DEFAULT 3300,
  rl_ohm       INTEGER NOT NULL DEFAULT 10000,
  api_key_hash TEXT,
  firmware     TEXT,
  installed_at TEXT NOT NULL,
  last_seen_at TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS readings_raw (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  ts        TEXT NOT NULL,
  mq2_adc   INTEGER NOT NULL,
  mq4_adc   INTEGER NOT NULL,
  mq8_adc   INTEGER NOT NULL,
  temp_c    REAL,
  humidity  REAL,
  vcc_mv    INTEGER,
  PRIMARY KEY (device_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_raw_ts ON readings_raw(ts);

CREATE TABLE IF NOT EXISTS readings_processed (
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  ts            TEXT NOT NULL,
  mq2_ppm       REAL NOT NULL,
  mq4_ppm       REAL NOT NULL,
  mq8_ppm       REAL NOT NULL,
  aqi_composite REAL NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('good','moderate','bad')),
  quality_flag  TEXT NOT NULL,
  PRIMARY KEY (device_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_proc_ts ON readings_processed(ts);

CREATE TABLE IF NOT EXISTS anomalies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric     TEXT NOT NULL,
  ts_start   TEXT NOT NULL,
  ts_end     TEXT NOT NULL,
  peak_value REAL NOT NULL,
  severity   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anom_device_ts ON anomalies(device_id, ts_start);

CREATE TABLE IF NOT EXISTS districts (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  lat      REAL NOT NULL,
  lng      REAL NOT NULL
);
