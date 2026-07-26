// Donut for part-of-whole splits (share of hours per status). The hole carries
// the headline number, which is the reason to prefer it over a pie here: the
// reader gets the total and the split in one glance.

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: Slice[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}

const THICKNESS = 18;

export default function DonutChart({ slices, centerValue, centerLabel, size = 200 }: DonutChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - THICKNESS / 2 - 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0" role="img">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={THICKNESS} />
        {total > 0 &&
          slices.map((s) => {
            const fraction = s.value / total;
            const dash = fraction * circumference;
            const el = (
              <circle
                key={s.label}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={THICKNESS}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                // Start at 12 o'clock rather than 3, which is where readers
                // expect a ring to begin.
                transform={`rotate(-90 ${c} ${c})`}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
        <text x={c} y={c - 2} textAnchor="middle" fontSize="26" fill="var(--text)" fontWeight="500">
          {centerValue}
        </text>
        <text x={c} y={c + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {centerLabel}
        </text>
      </svg>

      <ul className="flex-1 w-full flex flex-col gap-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="flex-1 text-gray-300">{s.label}</span>
            <b className="tabular-nums">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
