// Gradient-boosted regression trees (squared-error loss).
//
// Chosen over a linear model because the drivers of Almaty's air are strongly
// non-linear and interacting: wind only clears the valley above a threshold,
// a temperature inversion only matters when it's calm and after dark, rush
// hour only matters near a corridor. A depth-3 tree expresses those AND-rules
// directly; boosting a few hundred of them fits the residual structure that a
// single Holt trend line cannot.
//
// Everything is deterministic (seeded row subsampling) so two runs on the same
// history produce the same model — important when the number is shown to a
// user as a forecast.

import { buildBins, growTree, predictTree, type Tree, type TreeOptions } from './tree.js';

export interface GbdtOptions extends TreeOptions {
  rounds: number;
  learningRate: number;
  subsample: number; // fraction of rows per round, 1 = no subsampling
  seed: number;
}

export const DEFAULT_GBDT: GbdtOptions = {
  rounds: 160,
  learningRate: 0.06,
  maxDepth: 3,
  minSamplesLeaf: 8,
  minGain: 1e-6,
  subsample: 0.8,
  seed: 42,
};

export interface GbdtModel {
  base: number;
  learningRate: number;
  trees: Tree[];
  importance: number[]; // normalised 0..1, sums to 1
  nFeatures: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function trainGbdt(X: number[][], y: number[], opts: GbdtOptions = DEFAULT_GBDT): GbdtModel {
  const n = X.length;
  const nFeatures = X[0]?.length ?? 0;
  const base = y.reduce((s, v) => s + v, 0) / Math.max(1, n);

  const bins = buildBins(X);
  const importance = new Float64Array(nFeatures);
  const rand = mulberry32(opts.seed);
  const pred = new Array<number>(n).fill(base);
  const trees: Tree[] = [];

  const allRows = Array.from({ length: n }, (_, i) => i);

  for (let r = 0; r < opts.rounds; r++) {
    // Squared-error gradient: the residual itself.
    const residual = new Array<number>(n);
    for (let i = 0; i < n; i++) residual[i] = y[i]! - pred[i]!;

    const rows =
      opts.subsample >= 1 ? allRows : allRows.filter(() => rand() < opts.subsample);
    if (rows.length < 2 * opts.minSamplesLeaf) continue;

    const tree = growTree(X, residual, rows, bins, opts, importance);
    trees.push(tree);

    // Update the whole training set, not just the sampled rows — the tree is a
    // model of the residual everywhere, sampling only decorrelates the fits.
    for (let i = 0; i < n; i++) pred[i]! += opts.learningRate * predictTree(tree, X[i]!);
  }

  const totalImp = importance.reduce((s, v) => s + v, 0);
  return {
    base,
    learningRate: opts.learningRate,
    trees,
    nFeatures,
    importance: Array.from(importance, (v) => (totalImp > 0 ? v / totalImp : 0)),
  };
}

export function predictGbdt(model: GbdtModel, x: number[]): number {
  let out = model.base;
  for (const t of model.trees) out += model.learningRate * predictTree(t, x);
  return out;
}

export interface Metrics {
  mae: number;
  rmse: number;
  r2: number;
  n: number;
}

export function evaluate(actual: number[], predicted: number[]): Metrics {
  const n = actual.length;
  if (n === 0) return { mae: 0, rmse: 0, r2: 0, n: 0 };
  const mean = actual.reduce((s, v) => s + v, 0) / n;
  let absErr = 0;
  let sqErr = 0;
  let totalVar = 0;
  for (let i = 0; i < n; i++) {
    const e = actual[i]! - predicted[i]!;
    absErr += Math.abs(e);
    sqErr += e * e;
    totalVar += (actual[i]! - mean) ** 2;
  }
  return {
    mae: round2(absErr / n),
    rmse: round2(Math.sqrt(sqErr / n)),
    r2: totalVar > 0 ? round3(1 - sqErr / totalVar) : 0,
    n,
  };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
