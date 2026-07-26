// Station × hour-of-day heatmap.
//
// The single most useful view of this dataset: it exposes the daily rhythm
// (morning and evening rush, the overnight inversion) and the differences
// between districts in the same picture, which neither a line chart nor a bar
// chart can do without one series per station.

interface HeatmapProps {
  rows: Array<{ label: string; values: Array<number | null> }>;
  /** Column headings — hours 0..23 by default. */
  columns?: string[];
  colorFor: (value: number) => string;
  /**
   * Optional band classifier. When supplied, each cell also gets a hatch
   * density, so the daily rhythm is still readable when the three hues are
   * indistinguishable — in greyscale, in a projected slide, or to a reader with
   * red-green colour vision deficiency. 576 cells cannot each carry a shape
   * the way a table dot can, so texture does the job instead.
   */
  bandFor?: (value: number) => Band;
  unit?: string;
}

const BAND_HATCH: Record<Band, string | undefined> = {
  good: undefined,
  mid: 'repeating-linear-gradient(45deg, rgba(7,9,12,0.30) 0 1.5px, transparent 1.5px 5px)',
  bad: 'repeating-linear-gradient(45deg, rgba(7,9,12,0.45) 0 2px, transparent 2px 3.5px)',
};

import type { Band } from './primitives';

const DEFAULT_HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

export default function Heatmap({
  rows,
  columns = DEFAULT_HOURS,
  colorFor,
  bandFor,
  unit = '',
}: HeatmapProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted py-6 text-center">нет данных</p>;
  }

  return (
    // 24 columns never fit a phone; scrolling the grid horizontally keeps the
    // cells legible instead of shrinking them into an unreadable mosaic.
    <div className="scroll-x -mx-1 px-1">
      <div className="min-w-[560px]">
        <div className="flex items-center gap-1 mb-1 pl-[104px]">
          {columns.map((c, i) => (
            <span
              key={c}
              className="flex-1 text-center text-2xs text-muted tabular-nums"
            >
              {i % 2 === 0 ? c : ''}
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-1 mb-1">
            <span className="w-[100px] shrink-0 text-xs text-gray-300 truncate" title={row.label}>
              {row.label}
            </span>
            {row.values.map((v, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex-1 h-6 rounded-sm transition-colors"
                style={{
                  backgroundColor: v == null ? 'rgba(255,255,255,0.04)' : colorFor(v),
                  backgroundImage: v == null || !bandFor ? undefined : BAND_HATCH[bandFor(v)],
                  opacity: v == null ? 1 : 0.85,
                }}
                title={
                  v == null
                    ? `${row.label}, ${columns[i]}:00 — нет данных`
                    : `${row.label}, ${columns[i]}:00 — ${Math.round(v)}${unit}`
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
