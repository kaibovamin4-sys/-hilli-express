// Thin backend client. All fetches funnel through get(), one place for base URL
// and error handling. Backend types intentionally mirror src/types.ts on the
// server so response objects need no reshaping in components.

export const API_BASE_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  'http://localhost:8080';

export interface Point { lat: number; lng: number }

export interface District extends Point { id: string; name: string }

export interface Device extends Point {
  id: string;
  name: string;
  district: string | null;
  firmware: string | null;
  last_seen_at: string | null;
}

export type BackendStatus = 'good' | 'moderate' | 'bad';
export type StatusKey = 'good' | 'mid' | 'bad';

export const asKey = (s: BackendStatus): StatusKey => (s === 'moderate' ? 'mid' : s);

export interface Reading {
  device_id: string;
  ts: string;
  mq2_ppm: number;
  mq4_ppm: number;
  mq8_ppm: number;
  aqi_composite: number;
  status: BackendStatus;
  quality_flag: string;
}

export interface Contribution {
  device_id: string;
  name: string;
  distance_km: number;
  weight: number;
  value: number;
}

export interface FullStatus {
  ts: string;
  status: BackendStatus;
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
    contributing_posts: Contribution[];
  };
  external: {
    weather: {
      temperature_c: number;
      apparent_c: number;
      humidity: number;
      uv_index: number;
      wind_speed_ms: number;
      rain_mm: number;
      snowfall_cm: number;
    } | null;
    air_quality: { pm2_5: number | null; pm10: number | null; dust: number | null; us_aqi: number | null } | null;
    pollen: { max_level: string; dominant: string | null } | null;
  };
  recommendations: Recommendation[];
  best_walk_window: { start: string; end: string; reason: string } | null;
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
  fusion: { pm25: number; background_pm25: number; local_correction: number; confidence: number } | null;
}

export interface Recommendation {
  category: string;
  priority: 'info' | 'advice' | 'warn' | 'danger';
  icon: string;
  title: string;
  body: string;
}

export type Profile =
  | 'default' | 'infant' | 'child' | 'asthma' | 'allergy' | 'elderly' | 'athlete' | 'pregnant';

export interface ChatReply {
  intent: string;
  reply: string;
  suggestions: string[];
}

export interface WalkSpot extends Point {
  id: string;
  name: string;
  kind: 'park' | 'square' | 'promenade' | 'mountain';
  distance_km: number;
  pm25_estimate: number;
  traffic_index: number;
  construction_zone: boolean;
  score: number;
  verdict: 'отлично' | 'хорошо' | 'приемлемо' | 'не сегодня';
  reason: string;
}

export interface AddressCheck {
  address: string;
  lat: number;
  lng: number;
  alternatives: string[];
  status: BackendStatus;
  status_reason: string;
  max_safe_duration_min: number;
  recommendations: Recommendation[];
}

export interface Placement {
  order: number;
  lat: number;
  lng: number;
  cumulative_coverage: number;
}

export interface PlacementResult {
  effective_radius_km: number;
  placements: Placement[];
  coverage_curve: Array<{ stations: number; coverage: number }>;
  stations_for_90pct: number | null;
  existing_considered: number;
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

export interface Mq135AirReading {
  id: number;
  ts: string;
  topic: string;
  location: string;
  raw_adc: number;
  voltage: number;
  quality_percent: number;
  status: string;
}

export interface TrafficCorridor {
  id: string;
  name: string;
  path: Point[];
  load: number; // 0..1 effective congestion: live TomTom when fresh, otherwise model
  live_load: number | null; // 0..1 live congestion, or null if no live reading
}

export interface TrafficResponse {
  index: number;
  level: 'free' | 'moderate' | 'heavy' | 'jam';
  city_average: number;
  is_rush_hour: boolean;
  model_note: string;
  traffic_tiles_enabled: boolean;
  corridors: TrafficCorridor[];
}

// Station screens

export interface Climate {
  ts: string;
  sensor: 'DHT22';
  temp_c: number;
  humidity: number;
  dew_point_c: number;
  absolute_humidity: number;
  feels_like_c: number;
  comfort: string;
  comfort_note: string;
}

export type GasChannel = 'mq2' | 'mq4' | 'mq8' | 'mq135';
export type DeviceSensorKind = 'mq135' | 'mq_trio';

export interface StationReading {
  ts: string;
  aqi_composite: number;
  pm25_equivalent: number;
  status: BackendStatus;
  quality_flag: string;
  // Null on every channel this station does not physically carry.
  mq2_ppm: number | null;
  mq4_ppm: number | null;
  mq8_ppm: number | null;
  mq135_ppm: number | null;
  breakdown?: {
    aqi: number;
    dominant: GasChannel | null;
    parts: Partial<Record<GasChannel, number>>;
  } | null;
}

export interface Station extends Point {
  id: string;
  name: string;
  district: string | null;
  sensor_kind: DeviceSensorKind;
  /** Generated by the mock pipeline rather than measured. */
  is_demo: boolean;
  /** Colour of the station's own on-board indicator right now. */
  led: 'green' | 'red' | 'off';
  firmware: string | null;
  installed_at: string;
  last_seen_at: string | null;
  online: boolean;
  minutes_ago: number | null;
  reading: StationReading | null;
  climate: Climate | null;
  health: { score: number; status: string } | null;
  samples_24h: number;
}

export interface StationSeriesPoint {
  ts: string;
  aqi: number;
  mq2_ppm: number | null;
  mq4_ppm: number | null;
  mq8_ppm: number | null;
  mq135_ppm: number | null;
  temp_c: number | null;
  humidity: number | null;
  dew_point_c: number | null;
}

export interface SensorHealth {
  device_id: string;
  name: string;
  score: number;
  status: 'healthy' | 'watch' | 'suspect' | 'offline';
  factors: { uptime: number; data_quality: number; agreement: number; drift: number };
  last_seen_min_ago: number | null;
  packets_24h: number;
  hours_with_data: number;
  hours_expected: number;
  neighbor_deviation_aqi: number | null;
  hints: string[];
}

export interface Agg { min: number; max: number; avg: number; median: number }

export interface StationDetail {
  station: Station & {
    hardware: {
      board: string;
      gas_sensors: string[];
      /** Null when this build has no DHT22 fitted. */
      climate_sensor: string | null;
      has_led_indicator: boolean;
      vcc_mv: number;
      rl_ohm: number;
      r0: Partial<Record<GasChannel, number>>;
    };
  };
  reading: StationReading | null;
  climate: Climate | null;
  raw_adc: {
    ts: string;
    mq2_adc: number | null;
    mq4_adc: number | null;
    mq8_adc: number | null;
    mq135_adc: number | null;
    vcc_mv: number | null;
  } | null;
  health: SensorHealth | null;
  event: {
    kind: string;
    label: string;
    confidence: number;
    hint: string;
    ratios: { mq2: number; mq4: number; mq8: number };
  } | null;
  anomalies: AnomalyEvent[];
  window_hours: number;
  series: StationSeriesPoint[];
  stats: {
    aqi: Agg | null;
    temp_c: Agg | null;
    humidity: Agg | null;
    samples: number;
    samples_bad: number;
    samples_good: number;
  };
}

// ML forecast

export interface MlPoint {
  ts: string;
  horizon: number;
  aqi: number;
  pm25: number;
  status: BackendStatus;
  aqi_low: number;
  aqi_high: number;
  confidence: number;
  baseline_aqi: number;
}

export interface MlAccuracy {
  horizon: number;
  mae: number;
  rmse: number;
  r2: number;
  baseline_mae: number;
  external_mae: number;
  improvement_vs_baseline: number;
}

export interface MlForecast {
  device_id: string;
  generated_at: string;
  horizon_hours: number;
  points: MlPoint[];
  fallback: boolean;
  fallback_reason?: string;
  anchor: { lat: number; lng: number; station: string; distance_km: number };
  model: {
    method: string;
    trained_at: string;
    stations: number;
    train_rows: number;
    validation_rows: number;
    history_days: number;
    hyperparameters: {
      rounds: number;
      learning_rate: number;
      max_depth: number;
      min_samples_leaf: number;
      subsample: number;
    } | null;
    accuracy: MlAccuracy[];
    importance: Array<{ feature: string; label: string; importance: number }>;
  };
}

// Dashboard

export interface CitySeriesPoint {
  hour: string;
  ts: string;
  aqi: number;
  pm25: number;
  min: number;
  max: number;
  stations: number;
}

export interface DistrictRank extends Point {
  // /api/compare-districts is the lighter of the two sources and omits these;
  // /api/dashboard fills them in. Optional so both responses share one type.
  id?: string;
  has_own_station?: boolean;
  district: string;
  status: BackendStatus;
  score: number;
  aqi_composite: number;
  pm2_5: number | null;
  confidence: number;
  is_blind_zone: boolean;
}

export interface Dashboard {
  window_days: number;
  generated_at: string;
  kpi: {
    city_aqi: number | null;
    city_pm25: number | null;
    city_status: BackendStatus | null;
    stations_total: number;
    stations_online: number;
    anomalies_window: number;
    change_24h_pct: number | null;
    best_district: string | null;
    worst_district: string | null;
    avg_uptime: number;
  };
  city_series: CitySeriesPoint[];
  climate_series: Array<{ hour: string; ts: string; temp_c: number; humidity: number }>;
  per_station: Array<{
    id: string;
    name: string;
    district: string | null;
    current_aqi: number | null;
    current_status: BackendStatus | null;
    avg_aqi: number | null;
    max_aqi: number | null;
    min_aqi: number | null;
    uptime: number;
    samples: number;
    sparkline: number[];
  }>;
  hourly_profile: Array<{ station: string; id: string; values: Array<number | null> }>;
  weekday_profile: Array<{ day: string; aqi: number | null; samples: number }>;
  status_split: Array<{ status: BackendStatus; hours: number; share: number }>;
  districts: DistrictRank[];
  anomalies: AnomalyEvent[];
}

// Accuracy archive

export interface AccuracyPoint {
  hour: string;
  ours: number;
  reference: number;
  diff: number;
}

export interface Accuracy {
  window_days: number;
  reference_source: string | null;
  reference_kind: 'station' | 'model' | null;
  /** False when we are comparing against a model rather than a real station. */
  is_ground_truth: boolean;
  archive_rows: number;
  archive_since: string | null;
  paired_hours: number;
  metrics: {
    mae: number | null;
    bias: number | null;
    rmse: number | null;
    correlation: number | null;
    within_5: number | null;
    within_10: number | null;
  };
  series: AccuracyPoint[];
}

// Network plan

export interface PlannedStation extends Point {
  order: number;
  district: string | null;
  name: string;
  phase: number;
  phase_label: string;
  coverage_gain: number;
  cumulative_coverage: number;
}

export interface NetworkPlan {
  effective_radius_km: number;
  current: Array<Point & { id: string; name: string; district: string | null }>;
  current_coverage: number;
  planned: PlannedStation[];
  coverage_curve: Array<{ stations: number; coverage: number }>;
  stations_for_90pct: number | null;
  note: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const api = {
  districts: () => get<{ districts: District[] }>('/api/districts').then((r) => r.districts),
  devices: () => get<{ devices: Device[] }>('/api/devices').then((r) => r.devices),
  latest: () => get<{ readings: Reading[] }>('/api/readings/latest').then((r) => r.readings),
  air: (limit = 1) => get<{ latest: Mq135AirReading | null; readings: Mq135AirReading[] }>(`/api/air?limit=${limit}`),
  traffic: () => get<TrafficResponse>('/api/traffic'),
  history: (deviceId: string, hours = 24) =>
    get<{ readings: Reading[] }>(
      `/api/readings/history?device_id=${deviceId}&from=${hoursAgo(hours)}&to=${new Date().toISOString()}`,
    ).then((r) => r.readings),
  status: (p: Point, profile: Profile = 'default') =>
    get<FullStatus>(`/api/status?lat=${p.lat}&lng=${p.lng}&profile=${profile}`),
  anomalies: (sinceHours = 24) =>
    get<{ anomalies: AnomalyEvent[] }>(`/api/anomalies?since=${hoursAgo(sinceHours)}`).then((r) => r.anomalies),
  optimizePlacement: (stations = 20) =>
    get<PlacementResult>(`/api/optimize-placement?stations=${stations}&include_existing=true`),
  stations: () => get<{ stations: Station[] }>('/api/stations').then((r) => r.stations),
  station: (id: string, hours = 24) =>
    get<StationDetail>(`/api/stations/${encodeURIComponent(id)}?hours=${hours}`),
  mlForecast: (p: Point, hours = 6, deviceId?: string) =>
    get<MlForecast>(
      `/api/forecast/ml?lat=${p.lat}&lng=${p.lng}&hours=${hours}` +
        (deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''),
    ),
  dashboard: (days = 3) => get<Dashboard>(`/api/dashboard?days=${days}`),
  accuracy: (days = 7) => get<Accuracy>(`/api/accuracy?days=${days}`),
  networkPlan: (stations = 9) => get<NetworkPlan>(`/api/planned-stations?stations=${stations}`),
  compareDistricts: () =>
    get<{ ranking: DistrictRank[] }>('/api/compare-districts').then((r) => r.ranking),
  walkSpots: (p: Point, limit = 6) =>
    get<{ spots: WalkSpot[] }>(`/api/walk-spots?lat=${p.lat}&lng=${p.lng}&limit=${limit}`).then((r) => r.spots),
  checkAddress: (q: string, profile: Profile = 'default') =>
    get<AddressCheck>(`/api/check-address?q=${encodeURIComponent(q)}&profile=${profile}`),
  chat: (message: string, p: Point, profile: Profile = 'default') =>
    fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, lat: p.lat, lng: p.lng, profile }),
    }).then((r) => {
      if (!r.ok) throw new Error(`chat → ${r.status}`);
      return r.json() as Promise<ChatReply>;
    }),
};

// EPA-style reverse lookup: our composite AQI (0..500) → PM2.5-equivalent µg/m³.
// Used only for map/chart colour + labels so a station's composite fits the
// existing PM2.5-based colour scheme without changing the design.
export function aqiToPm(aqi: number): number {
  if (aqi <= 50) return aqi * (12 / 50);
  if (aqi <= 100) return 12 + (aqi - 50) * ((35.4 - 12) / 50);
  if (aqi <= 150) return 35.4 + (aqi - 100) * ((55.4 - 35.4) / 50);
  if (aqi <= 200) return 55.4 + (aqi - 150) * ((150.4 - 55.4) / 50);
  return 150.4 + (aqi - 200) * ((250 - 150.4) / 100);
}
