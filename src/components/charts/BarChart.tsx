// Vertical bars. Each bar carries its own colour so a series can be coloured
// by value (the AQI ramp) rather than by series identity — which is what every
// bar chart in this app actually wants.

import { linearScale, niceDomain, ticksFor } from './primitives';

export interface Bar {
  label: string;
  value: number | null;
  color: string;
  /** Optional second line under the label, e.g. a count. */
  sub?: string;
}

interface BarChartProps {
  bars: Bar[];
  height?: number;
  unit?: string;
  emptyLabel?: string;
  horizontal?: boolean;
}

const W = 720;
const PAD = { top: 16, right: 12, bottom: 34, left: 42 };

export default function BarChart({
  bars,
  height = 220,
  unit = '',
  emptyLabel = 'нет данных',
  horizontal = false,
}: BarChartProps) {
  const values = bars.map((b) => b.value).filter((v): v is number => v != null);
  if (values.length === 0) {
    return <p className="text-sm text-muted py-6 text-center">{emptyLabel}</p>;
  }

  if (horizontal) return <HorizontalBars bars={bars} unit={unit} />;

  const peak = Math.max(...values);
  // Small-magnitude series (a MAE around 9) lose all their differences when
  // rounded to whole numbers, so switch to one decimal below a threshold.
  const fmt = (v: number): string => (peak < 20 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));
  const domain = niceDomain(0, peak);
  const y = linearScale(domain, [height - PAD.bottom, PAD.top]);
  const slot = (W - PAD.left - PAD.right) / bars.length;
  const barW = Math.min(48, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img">
      {ticksFor(domain, 4).map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="rgba(255,255,255,0.07)"
          />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {Math.round(t)}
          </text>
        </g>
      ))}

      {bars.map((b, i) => {
        const cx = PAD.left + slot * (i + 0.5);
        if (b.value == null) {
          // Still label the slot: a gap with no name under it reads as a
          // rendering fault rather than as "no data for Monday".
          return (
            <g key={b.label}>
              <text x={cx} y={height - PAD.bottom - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                —
              </text>
              <text x={cx} y={height - PAD.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {b.label}
              </text>
            </g>
          );
        }
        const top = y(b.value);
        return (
          <g key={b.label}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.max(1, height - PAD.bottom - top)}
              rx="5"
              fill={b.color}
              opacity="0.82"
            />
            <text x={cx} y={top - 6} textAnchor="middle" fontSize="11" fill="var(--text)">
              {fmt(b.value)}
              {unit}
            </text>
            <text x={cx} y={height - PAD.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {b.label}
            </text>
            {b.sub && (
              <text x={cx} y={height - PAD.bottom + 28} textAnchor="middle" fontSize="9.5" fill="rgba(154,164,176,0.7)">
                {b.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Horizontal variant: used where the category labels are names rather than
// short codes, and would otherwise overlap under vertical bars.
function HorizontalBars({ bars, unit }: { bars: Bar[]; unit: string }) {
  const max = Math.max(...bars.map((b) => b.value ?? 0), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-[112px] shrink-0 text-sm text-gray-300 truncate" title={b.label}>
            {b.label}
          </span>
          <div className="flex-1 h-[22px] rounded-lg bg-fill overflow-hidden">
            <div
              className="h-full rounded-lg transition-[width] duration-500"
              style={{ width: `${((b.value ?? 0) / max) * 100}%`, background: b.color, opacity: 0.85 }}
            />
          </div>
          <span className="w-[64px] shrink-0 text-right text-sm tabular-nums">
            {b.value == null ? '—' : `${Math.round(b.value * 10) / 10}${unit}`}
          </span>
        </div>
      ))}
    </div>
  );
}
