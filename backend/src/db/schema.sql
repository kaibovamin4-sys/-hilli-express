-- AUA schema (SQLite / better-sqlite3).
-- Product invariants are enforced here rather than in application code,
-- so a corrupted client can never violate them.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- `sensor_kind` decides which gas columns a device fills:
--   'mq135'   — the station we actually build: one MQ-135 element
--   'mq_trio' — the MQ2/MQ4/MQ8 development fleet
-- `is_demo` marks synthetic devices so the UI can say so out loud instead of
-- presenting generated data as measurements.
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  district     TEXT,
  sensor_kind  TEXT NOT NULL DEFAULT 'mq_trio' CHECK (sensor_kind IN ('mq135','mq_trio')),
  is_demo      INTEGER NOT NULL DEFAULT 0,
  r0_mq2       REAL NOT NULL DEFAULT 10000,
  r0_mq4       REAL NOT NULL DEFAULT 10000,
  r0_mq8       REAL NOT NULL DEFAULT 10000,
  r0_mq135     REAL NOT NULL DEFAULT 10000,
  vcc_mv       INTEGER NOT NULL DEFAULT 3300,
  rl_ohm       INTEGER NOT NULL DEFAULT 10000,
  api_key_hash TEXT,
  firmware     TEXT,
  installed_at TEXT NOT NULL,
  last_seen_at TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

-- Gas columns are nullable: a device fills the channels it physically has and
-- leaves the rest NULL. Writing 0 into an absent channel would be a fabricated
-- measurement, and it would flow straight into the AQI composite.
CREATE TABLE IF NOT EXISTS readings_raw (
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
CREATE INDEX IF NOT EXISTS idx_raw_ts ON readings_raw(ts);

CREATE TABLE IF NOT EXISTS readings_processed (
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
CREATE INDEX IF NOT EXISTS idx_proc_ts ON readings_processed(ts);

-- Reference PM2.5 measurements from outside our network, archived hour by hour
-- next to our own estimates. Two purposes: continuous agreement checking, and
-- a growing calibration record — the longer the network runs, the better our
-- conversion into the familiar PM2.5 scale can be fitted.
--
-- `kind` separates a real reference-grade station from a model estimate, so the
-- UI never presents a model as ground truth.
CREATE TABLE IF NOT EXISTS reference_readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('station','model')),
  station_ref TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  ts          TEXT NOT NULL,
  pm2_5       REAL,
  pm10        REAL,
  UNIQUE (source, station_ref, ts)
);
CREATE INDEX IF NOT EXISTS idx_reference_ts ON reference_readings(ts);

CREATE TABLE IF NOT EXISTS mq135_air_readings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL,
  topic           TEXT NOT NULL,
  location        TEXT NOT NULL,
  raw_adc         INTEGER NOT NULL CHECK (raw_adc BETWEEN 0 AND 1023),
  voltage         REAL NOT NULL CHECK (voltage >= 0 AND voltage <= 5),
  quality_percent REAL NOT NULL CHECK (quality_percent >= 0 AND quality_percent <= 100),
  status          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mq135_air_ts ON mq135_air_readings(ts);

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
