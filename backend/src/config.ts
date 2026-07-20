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
  mockSeedDays: num('MOCK_SEED_DAYS', 3),
  cityLat: num('CITY_LAT', 43.238949),
  cityLng: num('CITY_LNG', 76.889709),
  cityName: env('CITY_NAME', 'Almaty'),
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
  logLevel: env('LOG_LEVEL', 'info'),
};

export type AppConfig = typeof config;
