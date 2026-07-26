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
  unit?: string;
}

const DEFAULT_HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

export default function Heatmap({ rows, columns = DEFAULT_HOURS, colorFor, unit = '' }: HeatmapProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-[color:var(--muted)] py-6 text-center">нет данных</p>;
  }

  return (
    // 24 columns never fit a phone; scrolling the grid horizontally keeps the
    // cells legible instead of shrinking them into an unreadable mosaic.
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="min-w-[560px]">
        <div className="flex items-center gap-1 mb-1 pl-[104px]">
          {columns.map((c, i) => (
            <span
              key={c}
              className="flex-1 text-center text-[9.5px] text-[color:var(--muted)] tabular-nums"
            >
              {i % 2 === 0 ? c : ''}
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-1 mb-1">
            <span className="w-[100px] shrink-0 text-[12px] text-gray-300 truncate" title={row.label}>
              {row.label}
            </span>
            {row.values.map((v, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex-1 h-6 rounded-[3px] transition-colors"
                style={{
                  background: v == null ? 'rgba(255,255,255,0.04)' : colorFor(v),
                  opacity: v == null ? 1 : 0.8,
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
