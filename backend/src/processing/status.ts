// Derives the good/moderate/bad status from the local MQ composite and, when
// available, external PM2.5.
//
// When Open-Meteo PM2.5 is present it's the primary anchor and the MQ composite
// can only make the status worse, never better. Without it we fall back to the
// MQ composite alone, which only catches nearby smoke/gas events.
//
// PM2.5 thresholds follow WHO 24h guidance: 15 / 35 / 75 µg/m³.

import type { StatusLevel } from '../types.js';

const PM25_MODERATE = 15;
const PM25_BAD = 35;
const PM25_HAZARD = 75;

const AQI_MODERATE = 100;
const AQI_BAD = 200;

export interface StatusInput {
  aqiComposite: number;
  pm25External: number | null;
}

export interface StatusResult {
  level: StatusLevel;
  score: number;      // higher = worse; used for finding a walk window
  reason: string;
}

export function statusFor({ aqiComposite, pm25External }: StatusInput): StatusResult {
  const localLevel = levelFromAqi(aqiComposite);
  const localScore = aqiComposite;

  if (pm25External == null) {
    return {
      level: localLevel,
      score: localScore,
      reason: `MQ-композит ${Math.round(aqiComposite)} (нет внешних данных PM2.5)`,
    };
  }

  const extLevel = levelFromPm25(pm25External);
  const level = worse(localLevel, extLevel);

  const parts: string[] = [];
  parts.push(`PM2.5 ${pm25External.toFixed(1)} µg/m³ (${extLevel})`);
  if (localLevel !== 'good') parts.push(`MQ-композит ${Math.round(aqiComposite)}`);

  return {
    level,
    score: Math.max(localScore, pm25External * 3),
    reason: parts.join(', '),
  };
}

export function levelFromPm25(pm: number): StatusLevel {
  if (pm >= PM25_BAD) return 'bad';
  if (pm >= PM25_MODERATE) return 'moderate';
  return 'good';
}

export function levelFromAqi(aqi: number): StatusLevel {
  if (aqi >= AQI_BAD) return 'bad';
  if (aqi >= AQI_MODERATE) return 'moderate';
  return 'good';
}

const RANK: Record<StatusLevel, number> = { good: 0, moderate: 1, bad: 2 };
const INV_RANK: Record<number, StatusLevel> = { 0: 'good', 1: 'moderate', 2: 'bad' };

export function worse(a: StatusLevel, b: StatusLevel): StatusLevel {
  return INV_RANK[Math.max(RANK[a], RANK[b])]!;
}

export const THRESHOLDS = {
  PM25_MODERATE,
  PM25_BAD,
  PM25_HAZARD,
  AQI_MODERATE,
  AQI_BAD,
};
