// Regression tree (CART, squared-error loss) — the weak learner behind the
// gradient-boosted forecast model in gbdt.ts.
//
// Splits are searched over pre-computed per-feature quantile bins instead of
// every distinct value. With ~30 features the exact search would dominate
// training time, and on a signal this smooth the extra thresholds buy nothing.
// Binning also makes training cost independent of how dense the history is.

export interface Leaf {
  kind: 'leaf';
  value: number;
}

export interface Branch {
  kind: 'branch';
  feature: number;
  threshold: number; // x <= threshold goes left
  left: Tree;
  right: Tree;
}

export type Tree = Leaf | Branch;

export interface TreeOptions {
  maxDepth: number;
  minSamplesLeaf: number;
  minGain: number; // minimum SSE reduction to accept a split
}

/**
 * Per-feature candidate thresholds, taken at evenly spaced quantiles of the
 * training column. Quantiles rather than an equal-width grid so that a feature
 * with a long tail (AQI spikes) still gets resolution where the mass is.
 */
export function buildBins(X: number[][], maxBins = 24): number[][] {
  const nFeat = X[0]?.length ?? 0;
  const bins: number[][] = [];
  for (let j = 0; j < nFeat; j++) {
    const col: number[] = [];
    for (const row of X) {
      const v = row[j]!;
      if (Number.isFinite(v)) col.push(v);
    }
    col.sort((a, b) => a - b);
    const seen = new Set<number>();
    const thresholds: number[] = [];
    for (let k = 1; k < maxBins; k++) {
      const idx = Math.floor((k / maxBins) * (col.length - 1));
      const v = col[idx];
      if (v === undefined) continue;
      // A threshold equal to the column max sends every row left, which is
      // never a usable split — drop it here rather than rejecting it per node.
      if (v === col[col.length - 1]) continue;
      if (!seen.has(v)) {
        seen.add(v);
        thresholds.push(v);
      }
    }
    bins.push(thresholds);
  }
  return bins;
}

function binIndex(thresholds: number[], v: number): number {
  // Index of the first threshold >= v, i.e. the bin this value falls into.
  let lo = 0;
  let hi = thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (thresholds[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface BestSplit {
  feature: number;
  threshold: number;
  gain: number;
  left: number[];
  right: number[];
}

function findSplit(
  X: number[][],
  y: number[],
  rows: number[],
  bins: number[][],
  opts: TreeOptions,
): BestSplit | null {
  const n = rows.length;
  let total = 0;
  for (const i of rows) total += y[i]!;

  let best: BestSplit | null = null;

  for (let j = 0; j < bins.length; j++) {
    const thresholds = bins[j]!;
    if (thresholds.length === 0) continue;
    const nBins = thresholds.length + 1;
    const cnt = new Float64Array(nBins);
    const sum = new Float64Array(nBins);

    for (const i of rows) {
      const b = binIndex(thresholds, X[i]![j]!);
      cnt[b]! += 1;
      sum[b]! += y[i]!;
    }

    // Prefix sweep: bins up to b go left, the rest right. Dropping the terms
    // that don't depend on the split, minimising the children's SSE is the
    // same as maximising the between-group sum of squares below — so one pass
    // over the bins scores every candidate threshold for this feature.
    let cntL = 0;
    let sumL = 0;
    for (let b = 0; b < nBins - 1; b++) {
      cntL += cnt[b]!;
      sumL += sum[b]!;
      const cntR = n - cntL;
      if (cntL < opts.minSamplesLeaf || cntR < opts.minSamplesLeaf) continue;
      const sumR = total - sumL;
      const gain = (sumL * sumL) / cntL + (sumR * sumR) / cntR - (total * total) / n;
      if (gain > (best?.gain ?? opts.minGain)) {
        best = { feature: j, threshold: thresholds[b]!, gain, left: [], right: [] };
      }
    }
  }

  if (!best) return null;
  for (const i of rows) {
    if (X[i]![best.feature]! <= best.threshold) best.left.push(i);
    else best.right.push(i);
  }
  if (best.left.length < opts.minSamplesLeaf || best.right.length < opts.minSamplesLeaf) return null;
  return best;
}

function mean(y: number[], rows: number[]): number {
  let s = 0;
  for (const i of rows) s += y[i]!;
  return rows.length ? s / rows.length : 0;
}

/**
 * Grows one tree. `importance` is accumulated in place across every tree of an
 * ensemble, so the caller sees total variance explained per feature.
 */
export function growTree(
  X: number[][],
  y: number[],
  rows: number[],
  bins: number[][],
  opts: TreeOptions,
  importance: Float64Array,
  depth = 0,
): Tree {
  if (depth >= opts.maxDepth || rows.length < 2 * opts.minSamplesLeaf) {
    return { kind: 'leaf', value: mean(y, rows) };
  }
  const split = findSplit(X, y, rows, bins, opts);
  if (!split) return { kind: 'leaf', value: mean(y, rows) };

  importance[split.feature]! += split.gain;
  return {
    kind: 'branch',
    feature: split.feature,
    threshold: split.threshold,
    left: growTree(X, y, split.left, bins, opts, importance, depth + 1),
    right: growTree(X, y, split.right, bins, opts, importance, depth + 1),
  };
}

export function predictTree(tree: Tree, x: number[]): number {
  let node = tree;
  while (node.kind === 'branch') {
    node = x[node.feature]! <= node.threshold ? node.left : node.right;
  }
  return node.value;
}
