// Composite air-quality index for the MQ sensors. Same shape as the US AQI: a
// piecewise-linear sub-index per gas (0..500), and the final index is the max,
// so one bad gas dominates.
//
// The breakpoints come from MQ sensitivity, not WHO/EPA health thresholds - MQ
// readings are combustible-gas equivalents, not a medical dose. The output is
// labelled "composite sensor index" everywhere so it is not mistaken for one.

export interface AqiBreakpoint {
  ppm: number;
  aqi: number;
}

export const MQ_BREAKPOINTS: Record<'mq2' | 'mq4' | 'mq8', AqiBreakpoint[]> = {
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

export function subIndex(kind: 'mq2' | 'mq4' | 'mq8', ppm: number): number {
  return interp(Math.max(0, ppm), MQ_BREAKPOINTS[kind]);
}

export interface CompositeInput {
  mq2_ppm: number;
  mq4_ppm: number;
  mq8_ppm: number;
}

export interface CompositeResult {
  aqi: number;
  dominant: 'mq2' | 'mq4' | 'mq8';
  parts: { mq2: number; mq4: number; mq8: number };
}

export function computeAqi(input: CompositeInput): CompositeResult {
  const parts = {
    mq2: subIndex('mq2', input.mq2_ppm),
    mq4: subIndex('mq4', input.mq4_ppm),
    mq8: subIndex('mq8', input.mq8_ppm),
  };
  let dominant: 'mq2' | 'mq4' | 'mq8' = 'mq2';
  let max = parts.mq2;
  if (parts.mq4 > max) { max = parts.mq4; dominant = 'mq4'; }
  if (parts.mq8 > max) { max = parts.mq8; dominant = 'mq8'; }
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
