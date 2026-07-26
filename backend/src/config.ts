import 'node:process';

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${name}`);
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number in env: ${name}`);
  return n;
}

export const config = {
  host: env('HOST', '0.0.0.0'),
  port: num('PORT', 8080),
  dbPath: env('DATABASE_PATH', './aua.db'),
  useMock: bool('USE_MOCK', true),
  mockIntervalMs: num('MOCK_INTERVAL_MS', 30_000),
  // Matches the 7 past days Open-Meteo returns for the forecast model, so the
  // seeded sensor history and its weather covariates cover the same span.
  mockSeedDays: num('MOCK_SEED_DAYS', 7),
  cityLat: num('CITY_LAT', 43.238949),
  cityLng: num('CITY_LNG', 76.889709),
  cityName: env('CITY_NAME', 'Almaty'),
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
  logLevel: env('LOG_LEVEL', 'info'),
  mqttEnabled: bool('MQTT_ENABLED', true),
  mqttBrokerUrl: env('MQTT_BROKER_URL', 'mqtt://broker.hivemq.com:1883'),
  mqttClientId: env('MQTT_CLIENT_ID', 'aua-backend-mq135'),
  mq135Topic: env('MQ135_TOPIC', 'almaty/auezov/mkr12/station1/air'),
  // The physically built station. Its MQTT payload carries no coordinates, so
  // where it hangs is configuration rather than data — without this it could
  // not be placed on the map or take part in the spatial interpolation.
  mq135DeviceId: env('MQ135_DEVICE_ID', 'aua-mq135-auezov-1'),
  mq135DeviceName: env('MQ135_DEVICE_NAME', 'Ауэзов мкр-12 · MQ-135'),
  mq135DeviceDistrict: env('MQ135_DEVICE_DISTRICT', 'Ауэзов (12 мкр)'),
  mq135Lat: num('MQ135_LAT', 43.2205),
  mq135Lng: num('MQ135_LNG', 76.834),
  // TomTom Traffic Flow. When TOMTOM_KEY is set the traffic layer uses live
  // road speeds; otherwise it falls back to the synthetic weekly model.
  tomtomKey: process.env.TOMTOM_KEY ?? '',
  trafficRefreshMs: num('TRAFFIC_REFRESH_MS', 120_000),
  // OpenAQ v3 aggregates national reference networks. With a key the accuracy
  // archive compares us against real monitoring stations; without one it falls
  // back to the Open-Meteo model and says so.
  openaqKey: process.env.OPENAQ_KEY ?? '',
  referenceRefreshMs: num('REFERENCE_REFRESH_MS', 30 * 60_000),
};

export type AppConfig = typeof config;
