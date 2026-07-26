// Composite air-quality index for the MQ sensors. Same shape as the US AQI: a
// piecewise-linear sub-index per gas (0..500), and the final index is the max,
// so one bad gas dominates.
//
// The breakpoints come from MQ sensitivity, not WHO/EPA health thresholds - MQ
// readings are combustible-gas equivalents, not a medical dose. The output is
// labelled "composite sensor index" everywhere so it is not mistaken for one.

import type { SensorKind } from '../types.js';

export interface AqiBreakpoint {
  ppm: number;
  aqi: number;
}

export const MQ_BREAKPOINTS: Record<SensorKind, AqiBreakpoint[]> = {
  mq2: [
    { ppm: 0, aqi: 0 },
    { ppm: 50, aqi: 0 },
    { ppm: 200, aqi: 100 },
    { ppm: 500, aqi: 200 },
    { ppm: 1000, aqi: 300 },
    { ppm: 2000, aqi: 500 },
  ],
  mq4: [
    { ppm: 0, aqi: 0 },
    { ppm: 100, aqi: 0 },
    { ppm: 500, aqi: 100 },
    { ppm: 1500, aqi: 200 },
    { ppm: 3000, aqi: 300 },
    { ppm: 5000, aqi: 500 },
  ],
  mq8: [
    { ppm: 0, aqi: 0 },
    { ppm: 50, aqi: 0 },
    { ppm: 200, aqi: 100 },
    { ppm: 500, aqi: 200 },
    { ppm: 1000, aqi: 300 },
    { ppm: 2000, aqi: 500 },
  ],
  // MQ-135 is read as a CO2 equivalent, so the anchors are the familiar indoor
  // air-quality bands: ~400 ppm is clean outdoor air, 1000 ppm is the point
  // where a room feels stuffy, 2000 ppm is clearly bad, 5000 ppm is the
  // occupational exposure limit.
  mq135: [
    { ppm: 0, aqi: 0 },
    { ppm: 400, aqi: 0 },
    { ppm: 800, aqi: 50 },
    { ppm: 1000, aqi: 100 },
    { ppm: 2000, aqi: 200 },
    { ppm: 5000, aqi: 300 },
    { ppm: 10000, aqi: 500 },
  ],
};

function interp(ppm: number, bp: AqiBreakpoint[]): number {
  for (let i = 1; i < bp.length; i++) {
    const lo = bp[i - 1]!;
    const hi = bp[i]!;
    if (ppm <= hi.ppm) {
      const t = (ppm - lo.ppm) / Math.max(1e-6, hi.ppm - lo.ppm);
      return Math.round(lo.aqi + t * (hi.aqi - lo.aqi));
    }
  }
  return bp[bp.length - 1]!.aqi;
}

export function subIndex(kind: SensorKind, ppm: number): number {
  return interp(Math.max(0, ppm), MQ_BREAKPOINTS[kind]);
}

// Channels are optional: a device contributes the elements it physically
// carries. An absent channel is skipped rather than scored as zero, which
// would silently drag a one-element station's composite down to "clean".
export type CompositeInput = Partial<Record<`${SensorKind}_ppm`, number | null>>;

export interface CompositeResult {
  aqi: number;
  dominant: SensorKind | null;
  parts: Partial<Record<SensorKind, number>>;
}

const CHANNELS: SensorKind[] = ['mq2', 'mq4', 'mq8', 'mq135'];

export function computeAqi(input: CompositeInput): CompositeResult {
  const parts: Partial<Record<SensorKind, number>> = {};
  let dominant: SensorKind | null = null;
  let max = 0;

  for (const kind of CHANNELS) {
    const ppm = input[`${kind}_ppm`];
    if (ppm == null || !Number.isFinite(ppm)) continue;
    const value = subIndex(kind, ppm);
    parts[kind] = value;
    if (dominant === null || value > max) {
      max = value;
      dominant = kind;
    }
  }

  return { aqi: max, dominant, parts };
}

// EPA PM2.5 breakpoints applied in both directions — used wherever the
// composite index needs a PM2.5-equivalent label (forecast, UI colouring).
// Not medically precise; presentation glue only.
export function aqiToPm(aqi: number): number {
  if (aqi <= 50) return aqi * (12 / 50);
  if (aqi <= 100) return 12 + (aqi - 50) * ((35.4 - 12) / 50);
  if (aqi <= 150) return 35.4 + (aqi - 100) * ((55.4 - 35.4) / 50);
  if (aqi <= 200) return 55.4 + (aqi - 150) * ((150.4 - 55.4) / 50);
  return 150.4 + (aqi - 200) * ((250 - 150.4) / 100);
}

export function pmToAqi(pm: number): number {
  if (pm <= 12) return (pm / 12) * 50;
  if (pm <= 35.4) return 50 + ((pm - 12) / (35.4 - 12)) * 50;
  if (pm <= 55.4) return 100 + ((pm - 35.4) / (55.4 - 35.4)) * 50;
  if (pm <= 150.4) return 150 + ((pm - 55.4) / (150.4 - 55.4)) * 50;
  return 200 + ((pm - 150.4) / (250 - 150.4)) * 100;
}
