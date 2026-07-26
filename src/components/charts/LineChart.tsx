// Multi-series line chart with optional area fill, confidence band and
// threshold guides. One component covers the forecast, the city trend and the
// station history because they differ only in which of those extras are on.

import { useId, useMemo, useState } from 'react';
import {
  areaPath,
  bandPath,
  linePath,
  linearScale,
  niceDomain,
  ticksFor,
  type Pt,
} from './primitives';

export interface Series {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** Draw as a dashed line — used for baselines the user should read as "reference". */
  dashed?: boolean;
  fill?: boolean;
}

export interface Band {
  lower: number[];
  upper: number[];
  color: string;
}

export interface Guide {
  value: number;
  label: string;
  color: string;
}

interface LineChartProps {
  labels: string[];
  series: Series[];
  band?: Band;
  guides?: Guide[];
  height?: number;
  unit?: string;
  /** Show at most this many x labels; the rest are thinned out evenly. */
  maxXLabels?: number;
  yMin?: number;
  formatValue?: (v: number) => string;
}

const W = 720;
const PAD = { top: 16, right: 16, bottom: 30, left: 42 };

export default function LineChart({
  labels,
  series,
  band,
  guides = [],
  height = 260,
  unit = '',
  maxXLabels = 6,
  yMin,
  formatValue = (v) => String(Math.round(v)),
}: LineChartProps) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const { x, y, domain } = useMemo(() => {
    const all: number[] = [];
    for (const s of series) for (const v of s.values) if (v != null) all.push(v);
    if (band) all.push(...band.lower, ...band.upper);
    for (const g of guides) all.push(g.value);

    const rawMin = all.length ? Math.min(...all) : 0;
    const rawMax = all.length ? Math.max(...all) : 1;
    const d = niceDomain(yMin ?? rawMin, rawMax);
    return {
      domain: d,
      x: linearScale([0, Math.max(1, labels.length - 1)], [PAD.left, W - PAD.right]),
      y: linearScale(d, [height - PAD.bottom, PAD.top]),
    };
  }, [series, band, guides, labels.length, height, yMin]);

  const toPoints = (values: Array<number | null>): Pt[] =>
    values
      .map((v, i) => (v == null ? null : ([x(i), y(v)] as Pt)))
      .filter((p): p is Pt => p !== null);

  const xLabelStride = Math.max(1, Math.ceil(labels.length / maxXLabels));
  const baselineY = height - PAD.bottom;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal grid + y axis */}
        {ticksFor(domain, 4).map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {formatValue(t)}
            </text>
          </g>
        ))}

        {guides.map((g) => (
          <g key={g.label}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(g.value)}
              y2={y(g.value)}
              stroke={g.color}
              strokeWidth="1"
              strokeDasharray="5 5"
              opacity="0.55"
            />
            <text x={W - PAD.right} y={y(g.value) - 5} textAnchor="end" fontSize="10" fill={g.color}>
              {g.label}
            </text>
          </g>
        ))}

        {band && (
          <path
            d={bandPath(
              band.upper.map((v, i) => [x(i), y(v)] as Pt),
              band.lower.map((v, i) => [x(i), y(v)] as Pt),
            )}
            fill={band.color}
            opacity="0.16"
          />
        )}

        {series.map((s) => {
          const pts = toPoints(s.values);
          return (
            <g key={s.key}>
              {s.fill && pts.length > 1 && (
                <path d={areaPath(pts, baselineY)} fill={`url(#${gradientId}-${s.key})`} />
              )}
              <path
                d={linePath(pts)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
            </g>
          );
        })}

        {/* x labels */}
        {labels.map((label, i) =>
          i % xLabelStride === 0 || i === labels.length - 1 ? (
            <text
              key={`${label}-${i}`}
              x={x(i)}
              y={height - 10}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
            >
              {label}
            </text>
          ) : null,
        )}

        {/* Hover crosshair. One invisible column per index, so the readout
            follows the pointer without needing per-point hit targets. */}
        {labels.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - (W - PAD.left - PAD.right) / Math.max(1, labels.length) / 2}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / Math.max(1, labels.length)}
            height={baselineY - PAD.top}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover != null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={baselineY}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
            />
            {series.map((s) => {
              const v = s.values[hover];
              return v == null ? null : (
                <circle key={s.key} cx={x(hover)} cy={y(v)} r="4" fill={s.color} stroke="var(--bg)" strokeWidth="1.5" />
              );
            })}
          </g>
        )}
      </svg>

      {hover != null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
          <span className="text-[color:var(--muted)]">{labels[hover]}</span>
          {series.map((s) => {
            const v = s.values[hover];
            return v == null ? null : (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <b>{formatValue(v)}{unit}</b>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
