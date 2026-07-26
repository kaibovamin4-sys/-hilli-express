// Generates fake ADC readings so the full pipeline (calibration, processing,
// API) can run without real hardware. Each value combines four parts:
//   1. a per-district baseline (residential vs industrial)
//   2. two daily rush-hour bumps (~8am and ~7pm)
//   3. a slow weekly swing for winter inversion smog
//   4. mean-reverting (Ornstein-Uhlenbeck) noise, so it drifts smoothly
//
// injectAnomaly() forces a spike to demo the alert path.

import type { Device, RawReading, ProcessedReading, SensorKind } from '../types.js';
import { MQ_COEFFS } from '../processing/calibration.js';
import { humidityFromDewPoint } from '../processing/climate.js';
import { processReading } from '../processing/pipeline.js';
import {
  insertRaw, insertProcessed, listDevices, touchDeviceSeen, insertRawBatch, insertProcessedBatch,
} from '../db/repositories.js';

// Deterministic PRNG (seeded per device)
// Small-state PRNG (mulberry32) so history is reproducible across restarts.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// State per device
interface DeviceState {
  ou: { mq2: number; mq4: number; mq8: number };
  rand: () => number;
  anomaly: null | { kind: AnomalyKind; endsAt: number; peakMul: number };
}
const state = new Map<string, DeviceState>();

function getState(device: Device): DeviceState {
  let s = state.get(device.id);
  if (!s) {
    s = {
      ou: { mq2: 300, mq4: 200, mq8: 120 },
      rand: mulberry32(seedFromString(device.id)),
      anomaly: null,
    };
    state.set(device.id, s);
  }
  return s;
}

// Signal shape
function diurnalFactor(hour: number): number {
  // Two-gaussian bumps at 8:00 and 19:00, baseline 1.
  const g = (x: number, mu: number, sigma: number) =>
    Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
  return 1 + 0.35 * g(hour, 8, 1.6) + 0.5 * g(hour, 19, 2.2);
}

function seasonalFactor(now: Date): number {
  // Winter (Dec–Feb) worse, summer better. Almaty inversion pattern.
  const month = now.getMonth();
  const winter = [11, 0, 1].includes(month) ? 1.6 : 1;
  const summer = [5, 6, 7].includes(month) ? 0.75 : 1;
  return winter * summer;
}

function districtBias(district: string | null): { mq2: number; mq4: number; mq8: number } {
  if (!district) return { mq2: 1, mq4: 1, mq8: 1 };
  if (/industry|прома|prom|industri/i.test(district)) return { mq2: 1.6, mq4: 1.3, mq8: 1.2 };
  if (/центр|center/i.test(district)) return { mq2: 1.3, mq4: 1.1, mq8: 1.05 };
  if (/парк|park|горн/i.test(district)) return { mq2: 0.7, mq4: 0.9, mq8: 0.9 };
  return { mq2: 1, mq4: 1, mq8: 1 };
}

// Ornstein–Uhlenbeck step: x_t = x_{t-1} + θ(μ-x_{t-1})Δt + σ√Δt·ε
function ouStep(x: number, mu: number, theta: number, sigma: number, dt: number, rand: () => number): number {
  const eps = normal(rand);
  return x + theta * (mu - x) * dt + sigma * Math.sqrt(dt) * eps;
}

function normal(rand: () => number): number {
  // Box–Muller
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Anomaly injection
export type AnomalyKind = 'traffic_spike' | 'industrial_release' | 'fire_smoke';

const ANOMALY_DURATION_MS: Record<AnomalyKind, number> = {
  traffic_spike: 10 * 60_000,
  industrial_release: 60 * 60_000,
  fire_smoke: 30 * 60_000,
};

const ANOMALY_MULTIPLIER: Record<AnomalyKind, { mq2: number; mq4: number; mq8: number }> = {
  traffic_spike:      { mq2: 3.5, mq4: 1.1, mq8: 1.1 },
  industrial_release: { mq2: 1.5, mq4: 4.5, mq8: 1.3 },
  fire_smoke:         { mq2: 5.0, mq4: 1.2, mq8: 3.5 },
};

export function injectAnomaly(deviceId: string, kind: AnomalyKind, now = Date.now()): void {
  const s = state.get(deviceId);
  if (!s) return;
  s.anomaly = { kind, endsAt: now + ANOMALY_DURATION_MS[kind], peakMul: 1 };
}

type TrioKind = 'mq2' | 'mq4' | 'mq8';

function anomalyMul(s: DeviceState, kind: TrioKind, nowMs: number): number {
  const a = s.anomaly;
  if (!a || nowMs > a.endsAt) return 1;
  const total = ANOMALY_DURATION_MS[a.kind];
  const remaining = a.endsAt - nowMs;
  // Bell curve: peak in the middle, taper at edges.
  const t = 1 - remaining / total;
  const shape = Math.sin(t * Math.PI);
  const target = ANOMALY_MULTIPLIER[a.kind][kind];
  return 1 + (target - 1) * shape;
}

// DHT22 (temperature + humidity)
//
// Modelled rather than randomised because these values are now shown to the
// user as a station reading and feed the forecast model as features — a curve
// that ignores time of day would teach the model that temperature is noise.
//
// Three layers: Almaty's seasonal mean, a diurnal swing peaking mid-afternoon,
// and an altitude correction (the city climbs ~1100 m from the northern plain
// to the mountain stations, and the standard 6.5 °C/km lapse rate is the whole
// reason Медеу reads several degrees cooler than Турксиб).
//
// Humidity is derived from a slowly varying dew point instead of being drawn
// independently: in reality the water content of the air barely moves over a
// day while RH swings widely as the temperature does, and only this way round
// does the pair stay physically consistent.

const CITY_LAT_NORTH = 43.34;
const CITY_LAT_SOUTH = 43.16;
const ELEVATION_NORTH_M = 600;
const ELEVATION_SOUTH_M = 1700;
const LAPSE_RATE_C_PER_M = 6.5 / 1000;

function elevationOf(lat: number): number {
  const t = (CITY_LAT_NORTH - lat) / (CITY_LAT_NORTH - CITY_LAT_SOUTH);
  return ELEVATION_NORTH_M + Math.max(0, Math.min(1, t)) * (ELEVATION_SOUTH_M - ELEVATION_NORTH_M);
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86_400_000;
}

function mockDht22(
  device: Device,
  at: Date,
  hour: number,
  rand: () => number,
): { temp: number; rh: number } {
  // Peak around 15 July (day 196), trough in mid-January.
  const seasonal = 11 + 13 * Math.cos((2 * Math.PI * (dayOfYear(at) - 196)) / 365);
  // Zero at 09:00, maximum at 15:00, minimum just before sunrise.
  const diurnal = 7 * Math.sin((2 * Math.PI * (hour - 9)) / 24);
  const altitude = (elevationOf(device.lat) - ELEVATION_NORTH_M) * LAPSE_RATE_C_PER_M;

  const temp = seasonal + diurnal - altitude + (rand() - 0.5) * 1.2;
  // Summer air here is markedly drier; the gap between mean temperature and
  // dew point widens with the season.
  const dew = seasonal - (6 + 4 * Math.max(0, Math.cos((2 * Math.PI * (dayOfYear(at) - 196)) / 365)));
  const rh = humidityFromDewPoint(temp, Math.min(temp - 0.5, dew + (rand() - 0.5) * 1.5));

  return { temp: Math.round(temp * 10) / 10, rh: Math.round(rh) };
}

// Emit one reading
function ppmToAdc(ppm: number, r0: number, vccMv: number, rlOhm: number, kind: SensorKind): number {
  const { a, b } = MQ_COEFFS[kind];
  const ratio = Math.pow(Math.max(0.001, ppm / a), 1 / b);
  const rs = ratio * r0;
  const vcc = vccMv / 1000;
  const vout = (vcc * rlOhm) / (rs + rlOhm);
  const adc = Math.round((vout / vcc) * 1023);
  return Math.max(1, Math.min(1022, adc));
}

export function generateOne(device: Device, at: Date = new Date()): { raw: RawReading; processed: ProcessedReading } {
  const s = getState(device);
  const hour = at.getHours() + at.getMinutes() / 60;
  const df = diurnalFactor(hour);
  const sf = seasonalFactor(at);
  const bias = districtBias(device.district);
  const dt = 30 / 60; // 30-second step in "hours" units for OU

  s.ou.mq2 = ouStep(s.ou.mq2, 260 * df * sf * bias.mq2, 0.6, 40, dt, s.rand);
  s.ou.mq4 = ouStep(s.ou.mq4, 180 * df * sf * bias.mq4, 0.4, 25, dt, s.rand);
  s.ou.mq8 = ouStep(s.ou.mq8, 110 * df * sf * bias.mq8, 0.5, 20, dt, s.rand);

  const nowMs = at.getTime();
  const target = {
    mq2: Math.max(10, s.ou.mq2 * anomalyMul(s, 'mq2', nowMs)),
    mq4: Math.max(10, s.ou.mq4 * anomalyMul(s, 'mq4', nowMs)),
    mq8: Math.max(10, s.ou.mq8 * anomalyMul(s, 'mq8', nowMs)),
  };

  const { temp, rh } = mockDht22(device, at, hour, s.rand);

  const mq2_adc = ppmToAdc(target.mq2, device.r0_mq2, device.vcc_mv, device.rl_ohm, 'mq2');
  const mq4_adc = ppmToAdc(target.mq4, device.r0_mq4, device.vcc_mv, device.rl_ohm, 'mq4');
  const mq8_adc = ppmToAdc(target.mq8, device.r0_mq8, device.vcc_mv, device.rl_ohm, 'mq8');

  const raw: RawReading = {
    device_id: device.id,
    ts: at.toISOString(),
    mq2_adc, mq4_adc, mq8_adc,
    // This generator only simulates the MQ2/MQ4/MQ8 development fleet; the
    // MQ-135 station is a real device and its readings arrive over MQTT.
    mq135_adc: null,
    temp_c: Math.round(temp * 10) / 10,
    humidity: Math.round(rh),
    vcc_mv: device.vcc_mv,
  };

  const processed = processReading(device, raw);
  return { raw, processed };
}

// Worker loop (mock only)
let timer: NodeJS.Timeout | null = null;

/** Simulated devices only — never overwrite a real station's history. */
function mockableDevices(): Device[] {
  return listDevices(true).filter((d) => d.is_demo === 1 && d.sensor_kind === 'mq_trio');
}

export function startMockLoop(intervalMs: number): void {
  if (timer) return;
  const tick = () => {
    const devs = mockableDevices();
    const now = new Date();
    for (const d of devs) {
      const { raw, processed } = generateOne(d, now);
      insertRaw(raw);
      insertProcessed(processed);
      touchDeviceSeen(d.id, now.toISOString());
    }
  };
  tick();
  timer = setInterval(tick, intervalMs);
}

export function stopMockLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// History seed
export function seedHistory(days: number): { insertedRaw: number; insertedProc: number } {
  const devs = mockableDevices();
  const now = new Date();
  const stepMs = 5 * 60_000;
  const start = new Date(now.getTime() - days * 24 * 60 * 60_000);
  let insertedRaw = 0, insertedProc = 0;
  for (const d of devs) {
    const raws: RawReading[] = [];
    const procs: ProcessedReading[] = [];
    // Reset state to make seed reproducible per device
    state.delete(d.id);
    for (let t = start.getTime(); t <= now.getTime(); t += stepMs) {
      const { raw, processed } = generateOne(d, new Date(t));
      raws.push(raw);
      procs.push(processed);
    }
    insertRawBatch(raws);
    insertProcessedBatch(procs);
    insertedRaw += raws.length;
    insertedProc += procs.length;
  }
  return { insertedRaw, insertedProc };
}
