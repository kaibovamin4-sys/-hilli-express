// Guesses the physical event behind a sensor spike. The three MQ sensors react
// differently to different gases, so an event leaves a characteristic ratio of
// increases across them. We take (current mean / baseline mean) per sensor and
// match that vector against known patterns by cosine similarity.
//
// Reference patterns (from combustion chemistry):
//   fire_smoke      MQ2 and MQ8 up (smoke + H2), MQ4 flat
//   gas_leak        MQ4 strongly up (methane), others mild
//   traffic         MQ2 up (unburnt hydrocarbons), MQ4 up, MQ8 mild
//   industrial      all three up roughly equally
//   inversion_smog  slow steady rise on all three
//   normal          no anomaly

import type { ProcessedReading } from '../types.js';

export type EventKind =
  | 'fire_smoke' | 'gas_leak' | 'traffic' | 'industrial' | 'inversion_smog' | 'normal';

interface Pattern {
  kind: EventKind;
  label: string;
  fingerprint: [number, number, number]; // relative growth for mq2,mq4,mq8
  hint: string;
}

const PATTERNS: Pattern[] = [
  { kind: 'fire_smoke',    label: 'Пожар / задымление',       fingerprint: [3.5, 1.1, 2.5], hint: 'Резкий рост дыма и водорода — возможно горение поблизости.' },
  { kind: 'gas_leak',      label: 'Утечка газа (CH₄)',        fingerprint: [1.2, 3.5, 1.2], hint: 'Изолированный рост метана — проверьте газовое оборудование.' },
  { kind: 'traffic',       label: 'Транспортный пик',          fingerprint: [2.2, 1.5, 1.2], hint: 'Характерно для часов пик рядом с оживлённой дорогой.' },
  { kind: 'industrial',    label: 'Промышленный выброс',       fingerprint: [1.8, 2.0, 1.7], hint: 'Все три газа растут вместе — вероятен точечный выброс.' },
  { kind: 'inversion_smog',label: 'Инверсия / застой воздуха', fingerprint: [1.4, 1.4, 1.4], hint: 'Плавный рост всех газов — воздух не проветривается.' },
];

export interface Classification {
  kind: EventKind;
  label: string;
  confidence: number;    // 0..1
  ratios: { mq2: number; mq4: number; mq8: number };
  hint: string;
  runner_up: { kind: EventKind; confidence: number } | null;
  slope_ppm_per_min: { mq2: number; mq4: number; mq8: number };
}

export interface ClassifyInput {
  recent: ProcessedReading[];   // last ~15 min
  baseline: ProcessedReading[]; // preceding ~3 h
}

export function classify(input: ClassifyInput): Classification {
  if (input.recent.length < 3 || input.baseline.length < 10) {
    return {
      kind: 'normal', label: 'Штатно', confidence: 0.5,
      ratios: { mq2: 1, mq4: 1, mq8: 1 },
      hint: 'Недостаточно данных для классификации.',
      runner_up: null,
      slope_ppm_per_min: { mq2: 0, mq4: 0, mq8: 0 },
    };
  }

  const recentMean = meanOf(input.recent);
  const baseMean = meanOf(input.baseline);
  const ratios = {
    mq2: safeRatio(recentMean.mq2, baseMean.mq2),
    mq4: safeRatio(recentMean.mq4, baseMean.mq4),
    mq8: safeRatio(recentMean.mq8, baseMean.mq8),
  };

  const maxGrowth = Math.max(ratios.mq2, ratios.mq4, ratios.mq8);
  if (maxGrowth < 1.3) {
    return {
      kind: 'normal', label: 'Штатно', confidence: 0.9,
      ratios,
      hint: 'Все датчики близки к базовой линии.',
      runner_up: null,
      slope_ppm_per_min: slope(input.recent),
    };
  }

  const v = normalize([ratios.mq2, ratios.mq4, ratios.mq8]);
  const scored = PATTERNS.map((p) => ({
    p,
    sim: cosine(v, normalize(p.fingerprint)),
  })).sort((a, b) => b.sim - a.sim);

  const best = scored[0]!;
  const second = scored[1]!;

  // Inversion is time-shape rather than ratio-shape: detect slow steady rise
  // over the pre-event baseline. Slope is measured on BASELINE only so an
  // acute recent spike doesn't get mislabelled as inversion.
  const shape = slope(input.baseline);
  const modest = shape.mq2 < 3 && shape.mq4 < 3 && shape.mq8 < 3;
  const slow =
    maxGrowth < 1.8 &&
    shape.mq2 > 0.05 && shape.mq4 > 0.05 && shape.mq8 > 0.02 &&
    modest;
  if (slow && best.p.kind !== 'gas_leak') {
    return {
      kind: 'inversion_smog',
      label: 'Инверсия / застой воздуха',
      confidence: 0.7,
      ratios,
      hint: PATTERNS.find((p) => p.kind === 'inversion_smog')!.hint,
      runner_up: { kind: best.p.kind, confidence: Math.round(best.sim * 100) / 100 },
      slope_ppm_per_min: shape,
    };
  }

  return {
    kind: best.p.kind,
    label: best.p.label,
    confidence: Math.round(best.sim * 100) / 100,
    ratios: {
      mq2: Math.round(ratios.mq2 * 100) / 100,
      mq4: Math.round(ratios.mq4 * 100) / 100,
      mq8: Math.round(ratios.mq8 * 100) / 100,
    },
    hint: best.p.hint,
    runner_up: { kind: second.p.kind, confidence: Math.round(second.sim * 100) / 100 },
    slope_ppm_per_min: shape,
  };
}

function meanOf(rows: ProcessedReading[]): { mq2: number; mq4: number; mq8: number } {
  const n = rows.length;
  if (n === 0) return { mq2: 0, mq4: 0, mq8: 0 };
  let a = 0, b = 0, c = 0;
  for (const r of rows) { a += r.mq2_ppm; b += r.mq4_ppm; c += r.mq8_ppm; }
  return { mq2: a / n, mq4: b / n, mq8: c / n };
}

function safeRatio(a: number, b: number): number {
  return b < 1 ? (a < 1 ? 1 : 10) : a / b;
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n === 0 ? v : v.map((x) => x / n);
}

function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return Math.max(0, Math.min(1, s));
}

function slope(rows: ProcessedReading[]): { mq2: number; mq4: number; mq8: number } {
  if (rows.length < 2) return { mq2: 0, mq4: 0, mq8: 0 };
  const t0 = new Date(rows[0]!.ts).getTime();
  const points = rows.map((r) => ({ x: (new Date(r.ts).getTime() - t0) / 60_000, r }));
  return {
    mq2: linreg(points.map((p) => [p.x, p.r.mq2_ppm])),
    mq4: linreg(points.map((p) => [p.x, p.r.mq4_ppm])),
    mq8: linreg(points.map((p) => [p.x, p.r.mq8_ppm])),
  };
}

function linreg(pts: number[][]): number {
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p[0]!, 0);
  const sy = pts.reduce((s, p) => s + p[1]!, 0);
  const sxy = pts.reduce((s, p) => s + p[0]! * p[1]!, 0);
  const sxx = pts.reduce((s, p) => s + p[0]! * p[0]!, 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : Math.round(((n * sxy - sx * sy) / denom) * 1000) / 1000;
}
