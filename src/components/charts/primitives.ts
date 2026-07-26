// Shared plumbing for the SVG charts.
//
// No charting library: every chart here is a handful of paths over a fixed
// viewBox, and pulling in a 100 kB dependency to draw them would cost more
// than it saves on a page people open on mobile data. `viewBox` + `width:100%`
// gives responsiveness for free, and because the box never changes, one set of
// font sizes stays legible at every screen width.

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  invert: (px: number) => number;
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  // A flat series would divide by zero; pin it to the middle of the range.
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  fn.domain = domain;
  fn.range = range;
  fn.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span;
  return fn;
}

/** Round domain bounds outward to a human-friendly step. */
export function niceDomain(min: number, max: number, ticks = 4): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [Math.min(0, min), max + 1];
  const step = niceStep((max - min) / ticks);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rough) || 1));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

export function ticksFor(domain: [number, number], count = 4): number[] {
  const [min, max] = domain;
  const step = niceStep((max - min) / count);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

export type Pt = [number, number];

export function linePath(points: Pt[]): string {
  if (points.length === 0) return '';
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

/** Closed path between an upper and a lower boundary — confidence bands. */
export function bandPath(upper: Pt[], lower: Pt[]): string {
  if (upper.length === 0) return '';
  const down = [...lower].reverse();
  return `${linePath(upper)} L${down[0]![0].toFixed(2)},${down[0]![1].toFixed(2)} ${down
    .slice(1)
    .map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ')} Z`;
}

/** Area under a line down to a baseline y. */
export function areaPath(points: Pt[], baselineY: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)} L${last[0].toFixed(2)},${baselineY.toFixed(2)} L${first[0].toFixed(
    2,
  )},${baselineY.toFixed(2)} Z`;
}

// The colour ramp used everywhere a value is shown as a colour. Thresholds are
// the WHO PM2.5 bands the rest of the app already speaks in, mapped through our
// composite scale so a chart and a map pin never disagree.
export const AQI_GOOD = 100;
export const AQI_BAD = 200;

export function aqiColor(aqi: number): string {
  if (aqi >= AQI_BAD) return 'var(--bad)';
  if (aqi >= AQI_GOOD) return 'var(--mid)';
  return 'var(--good)';
}

export function pmColorVar(pm: number): string {
  if (pm >= 35) return 'var(--bad)';
  if (pm >= 15) return 'var(--mid)';
  return 'var(--good)';
}

/** Local time-of-day label, e.g. `14:00`. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayHour(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:00`;
}
