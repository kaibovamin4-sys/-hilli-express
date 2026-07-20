export type SensorKind = 'mq2' | 'mq4' | 'mq8';

export type StatusLevel = 'good' | 'moderate' | 'bad';

export type QualityFlag = 'ok' | 'warmup' | 'anomaly' | 'sensor_error' | 'no_compensation';

export interface Device {
  id: string;
  name: string;
  lat: number;
  lng: number;
  district: string | null;
  r0_mq2: number;
  r0_mq4: number;
  r0_mq8: number;
  vcc_mv: number;
  rl_ohm: number;
  firmware: string | null;
  installed_at: string;
  last_seen_at: string | null;
  active: number;
}

export interface RawReading {
  device_id: string;
  ts: string;
  mq2_adc: number;
  mq4_adc: number;
  mq8_adc: number;
  temp_c: number | null;
  humidity: number | null;
  vcc_mv: number | null;
}

export interface ProcessedReading {
  device_id: string;
  ts: string;
  mq2_ppm: number;
  mq4_ppm: number;
  mq8_ppm: number;
  aqi_composite: number;
  status: StatusLevel;
  quality_flag: QualityFlag;
}

export interface AnomalyEvent {
  id?: number;
  device_id: string;
  metric: string;
  ts_start: string;
  ts_end: string;
  peak_value: number;
  severity: number;
}

export interface Point {
  lat: number;
  lng: number;
}

export interface IdwContribution {
  device_id: string;
  name: string;
  distance_km: number;
  weight: number;
  value: number;
}

export interface IdwResult {
  value: number;
  contributions: IdwContribution[];
  confidence: number;
  nearest: { device_id: string; name: string; distance_km: number } | null;
  is_blind_zone: boolean;
}

export interface WeatherSnapshot {
  ts: string;
  temperature_c: number;
  apparent_c: number;
  humidity: number;
  precipitation_mm: number;
  rain_mm: number;
  snowfall_cm: number;
  cloud_cover: number;
  wind_speed_ms: number;
  wind_gusts_ms: number;
  uv_index: number;
  weather_code: number;
  is_day: boolean;
  pressure_hpa: number;
}

export interface WeatherHourly {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  precipitation: number[];
  uv_index: number[];
  wind_speed_10m: number[];
  weather_code: number[];
  apparent_temperature: number[];
}

export interface WeatherForecast {
  current: WeatherSnapshot;
  hourly: WeatherHourly;
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    uv_index_max: number[];
    precipitation_sum: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export interface AirQualityExternal {
  ts: string;
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogen_dioxide: number | null;
  sulphur_dioxide: number | null;
  carbon_monoxide: number | null;
  dust: number | null;
  european_aqi: number | null;
  us_aqi: number | null;
  aerosol_optical_depth: number | null;
}

export interface PollenSnapshot {
  ts: string;
  alder: number | null;
  birch: number | null;
  grass: number | null;
  mugwort: number | null;
  olive: number | null;
  ragweed: number | null;
  max_level: 'none' | 'low' | 'moderate' | 'high' | 'very_high';
  dominant: string | null;
}

export type Profile =
  | 'default'
  | 'infant'
  | 'child'
  | 'asthma'
  | 'allergy'
  | 'elderly'
  | 'athlete'
  | 'pregnant';

export interface Recommendation {
  category:
    | 'air'
    | 'clothing'
    | 'bring'
    | 'timing'
    | 'uv'
    | 'pollen'
    | 'heat'
    | 'cold'
    | 'wind'
    | 'rain'
    | 'safety';
  priority: 'info' | 'advice' | 'warn' | 'danger';
  icon: string;
  title: string;
  body: string;
}

export interface WalkWindow {
  start: string;
  end: string;
  quality_score: number;
  reason: string;
}

export interface FullStatus {
  ts: string;
  location: { lat: number; lng: number; district: string | null };
  status: StatusLevel;
  status_reason: string;
  confidence: number;
  is_blind_zone: boolean;
  local: {
    aqi_composite: number;
    mq2_ppm: number;
    mq4_ppm: number;
    mq8_ppm: number;
    based_on: 'measurement' | 'interpolation';
    nearest_post: { device_id: string; name: string; distance_km: number } | null;
    contributing_posts: IdwContribution[];
  };
  external: {
    weather: WeatherSnapshot | null;
    air_quality: AirQualityExternal | null;
    pollen: PollenSnapshot | null;
  };
  recommendations: Recommendation[];
  best_walk_window: WalkWindow | null;
  max_safe_duration_min: number;
  city: {
    traffic: {
      index: number;
      level: string;
      is_rush_hour: boolean;
      nearest_corridor: { name: string; distance_km: number } | null;
    };
    construction: {
      inside_zone: boolean;
      dust_factor: number;
      nearest: { name: string; distance_km: number } | null;
    };
  } | null;
  fusion: {
    pm25: number;
    background_pm25: number;
    local_correction: number;
    confidence: number;
    method: string;
  } | null;
  disclaimer: string;
}
