// Thin backend client. All fetches funnel through get(), one place for base URL
// and error handling. Backend types intentionally mirror src/types.ts on the
// server so response objects need no reshaping in components.

const BASE =
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

export interface AnomalyEvent {
  id?: number;
  device_id: string;
  metric: string;
  ts_start: string;
  ts_end: string;
  peak_value: number;
  severity: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const api = {
  districts: () => get<{ districts: District[] }>('/api/districts').then((r) => r.districts),
  devices: () => get<{ devices: Device[] }>('/api/devices').then((r) => r.devices),
  latest: () => get<{ readings: Reading[] }>('/api/readings/latest').then((r) => r.readings),
  history: (deviceId: string, hours = 24) =>
    get<{ readings: Reading[] }>(
      `/api/readings/history?device_id=${deviceId}&from=${hoursAgo(hours)}&to=${new Date().toISOString()}`,
    ).then((r) => r.readings),
  status: (p: Point, profile: Profile = 'default') =>
    get<FullStatus>(`/api/status?lat=${p.lat}&lng=${p.lng}&profile=${profile}`),
  anomalies: (sinceHours = 24) =>
    get<{ anomalies: AnomalyEvent[] }>(`/api/anomalies?since=${hoursAgo(sinceHours)}`).then((r) => r.anomalies),
  walkSpots: (p: Point, limit = 6) =>
    get<{ spots: WalkSpot[] }>(`/api/walk-spots?lat=${p.lat}&lng=${p.lng}&limit=${limit}`).then((r) => r.spots),
  checkAddress: (q: string, profile: Profile = 'default') =>
    get<AddressCheck>(`/api/check-address?q=${encodeURIComponent(q)}&profile=${profile}`),
  chat: (message: string, p: Point, profile: Profile = 'default') =>
    fetch(`${BASE}/api/chat`, {
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
