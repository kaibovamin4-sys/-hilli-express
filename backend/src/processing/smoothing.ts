// Signal smoothing.
//
// Median filter (window 5) — kills single-sample ADC spikes from power/RF noise.
// EMA (α=0.2) — takes the median-filtered signal and produces the live value
//   shown to users. Formula: y_t = α*x_t + (1-α)*y_{t-1}.
// Warm-up detector — MQ heater takes 24h+ to stabilise; we call it warmed up
//   when the rolling std of the last N samples falls below a threshold.

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function medianFilter(series: number[], window = 5): number[] {
  const out: number[] = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < series.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(series.length, i + half + 1);
    out.push(median(series.slice(lo, hi)));
  }
  return out;
}

export function ema(series: number[], alpha = 0.2): number[] {
  if (series.length === 0) return [];
  const out: number[] = [series[0]!];
  for (let i = 1; i < series.length; i++) {
    out.push(alpha * series[i]! + (1 - alpha) * out[i - 1]!);
  }
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function isWarmedUp(recentRs: number[], stdThreshold = 500): boolean {
  if (recentRs.length < 10) return false;
  return std(recentRs.slice(-30)) < stdThreshold;
}
