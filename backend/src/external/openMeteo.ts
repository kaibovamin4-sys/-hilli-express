// Open-Meteo integration. Both endpoints are key-free:
//   forecast     https://api.open-meteo.com/v1/forecast
//   air-quality  https://air-quality-api.open-meteo.com/v1/air-quality  (also pollen)
//
// Responses are cached ~10 min per location (rounded to 0.05 degrees) since the
// data is hourly and there's no point re-fetching on every click.

import { request } from 'undici';
import type {
  WeatherForecast,
  WeatherSnapshot,
  WeatherHourly,
  AirQualityExternal,
  PollenSnapshot,
} from '../types.js';
import { cached } from './cache.js';

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const TTL_MS = 10 * 60 * 1000;

function roundKey(lat: number, lng: number): string {
  const r = (n: number) => Math.round(n * 20) / 20;
  return `${r(lat).toFixed(2)},${r(lng).toFixed(2)}`;
}

async function fetchJson(url: string, params: Record<string, string | number>): Promise<any> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  const full = `${url}?${q.toString()}`;
  const { statusCode, body } = await request(full, {
    headers: { 'user-agent': 'aua-backend/1.0' },
  });
  const text = await body.text();
  if (statusCode >= 400) {
    throw new Error(`Open-Meteo ${url} ${statusCode}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

export async function getWeather(lat: number, lng: number): Promise<WeatherForecast> {
  const key = `weather:${roundKey(lat, lng)}`;
  return cached(key, TTL_MS, async () => {
    const j = await fetchJson(WEATHER_URL, {
      latitude: lat,
      longitude: lng,
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,snowfall,' +
        'cloud_cover,wind_speed_10m,wind_gusts_10m,uv_index,weather_code,is_day,pressure_msl',
      hourly:
        'temperature_2m,apparent_temperature,precipitation_probability,precipitation,' +
        'uv_index,wind_speed_10m,weather_code',
      daily:
        'temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_sum,sunrise,sunset',
      timezone: 'auto',
      forecast_days: 2,
    });
    const c = j.current ?? {};
    const current: WeatherSnapshot = {
      ts: c.time ?? new Date().toISOString(),
      temperature_c: c.temperature_2m ?? 0,
      apparent_c: c.apparent_temperature ?? 0,
      humidity: c.relative_humidity_2m ?? 0,
      precipitation_mm: c.precipitation ?? 0,
      rain_mm: c.rain ?? 0,
      snowfall_cm: c.snowfall ?? 0,
      cloud_cover: c.cloud_cover ?? 0,
      wind_speed_ms: (c.wind_speed_10m ?? 0) / 3.6,
      wind_gusts_ms: (c.wind_gusts_10m ?? 0) / 3.6,
      uv_index: c.uv_index ?? 0,
      weather_code: c.weather_code ?? 0,
      is_day: (c.is_day ?? 1) === 1,
      pressure_hpa: c.pressure_msl ?? 1013,
    };
    const hourly: WeatherHourly = {
      time: j.hourly?.time ?? [],
      temperature_2m: j.hourly?.temperature_2m ?? [],
      precipitation_probability: j.hourly?.precipitation_probability ?? [],
      precipitation: j.hourly?.precipitation ?? [],
      uv_index: j.hourly?.uv_index ?? [],
      wind_speed_10m: (j.hourly?.wind_speed_10m ?? []).map((v: number) => v / 3.6),
      weather_code: j.hourly?.weather_code ?? [],
      apparent_temperature: j.hourly?.apparent_temperature ?? [],
    };
    return {
      current,
      hourly,
      daily: {
        time: j.daily?.time ?? [],
        temperature_2m_max: j.daily?.temperature_2m_max ?? [],
        temperature_2m_min: j.daily?.temperature_2m_min ?? [],
        uv_index_max: j.daily?.uv_index_max ?? [],
        precipitation_sum: j.daily?.precipitation_sum ?? [],
        sunrise: j.daily?.sunrise ?? [],
        sunset: j.daily?.sunset ?? [],
      },
    };
  });
}

interface AirQualityFull {
  current: AirQualityExternal;
  pollen: PollenSnapshot;
  hourly_pm25: { time: string[]; values: number[] };
}

export async function getAirQuality(lat: number, lng: number): Promise<AirQualityFull> {
  const key = `air:${roundKey(lat, lng)}`;
  return cached(key, TTL_MS, async () => {
    const j = await fetchJson(AIR_URL, {
      latitude: lat,
      longitude: lng,
      current:
        'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,' +
        'aerosol_optical_depth,european_aqi,us_aqi,' +
        'alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen',
      hourly: 'pm2_5,pm10,ozone,nitrogen_dioxide',
      timezone: 'auto',
      forecast_days: 2,
    });
    const c = j.current ?? {};
    const current: AirQualityExternal = {
      ts: c.time ?? new Date().toISOString(),
      pm2_5: coerce(c.pm2_5),
      pm10: coerce(c.pm10),
      ozone: coerce(c.ozone),
      nitrogen_dioxide: coerce(c.nitrogen_dioxide),
      sulphur_dioxide: coerce(c.sulphur_dioxide),
      carbon_monoxide: coerce(c.carbon_monoxide),
      dust: coerce(c.dust),
      european_aqi: coerce(c.european_aqi),
      us_aqi: coerce(c.us_aqi),
      aerosol_optical_depth: coerce(c.aerosol_optical_depth),
    };
    const pollen = classifyPollen(c);
    const hourly_pm25 = {
      time: j.hourly?.time ?? [],
      values: (j.hourly?.pm2_5 ?? []).map((v: number | null) => (v == null ? 0 : v)),
    };
    return { current, pollen, hourly_pm25 };
  });
}

function coerce(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Grain/pollen/m³ thresholds (rough, Berger-Vergnaud-style bands):
//   grass:  1/20/50, tree: 15/90/1500, weed: 10/50/500.
// We take the max category across species → single "max_level" for the UI.
function classifyPollen(c: any): PollenSnapshot {
  const values = {
    alder: coerce(c.alder_pollen),
    birch: coerce(c.birch_pollen),
    grass: coerce(c.grass_pollen),
    mugwort: coerce(c.mugwort_pollen),
    olive: coerce(c.olive_pollen),
    ragweed: coerce(c.ragweed_pollen),
  };
  const bands: Record<string, [number, number, number]> = {
    alder:   [15, 90, 1500],
    birch:   [15, 90, 1500],
    olive:   [15, 90, 1500],
    grass:   [1, 20, 50],
    mugwort: [10, 50, 500],
    ragweed: [10, 50, 500],
  };
  let maxRank = 0;
  let dominant: string | null = null;
  for (const [k, v] of Object.entries(values)) {
    if (v == null) continue;
    const [low, mid, high] = bands[k]!;
    const rank = v <= 0 ? 0 : v < low ? 1 : v < mid ? 2 : v < high ? 3 : 4;
    if (rank > maxRank) {
      maxRank = rank;
      dominant = k;
    }
  }
  const labels: PollenSnapshot['max_level'][] = ['none', 'low', 'low', 'moderate', 'high'];
  const max_level = maxRank >= 4 ? 'very_high' : labels[maxRank]!;
  return { ts: c.time ?? new Date().toISOString(), ...values, max_level, dominant };
}
