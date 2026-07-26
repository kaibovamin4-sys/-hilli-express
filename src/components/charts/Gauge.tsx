// Semicircular gauge for a single bounded value (AQI now, model confidence,
// station health). The arc carries the colour ramp, so the reading is legible
// before the number is even read.

interface GaugeProps {
  value: number;
  max: number;
  color: string;
  label: string;
  caption?: string;
  size?: number;
  formatValue?: (v: number) => string;
}

export default function Gauge({
  value,
  max,
  color,
  label,
  caption,
  size = 180,
  formatValue = (v) => String(Math.round(v)),
}: GaugeProps) {
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  // Half circle: the arc length is πr, and the dash offset walks the value
  // along it. Simpler and crisper than composing two quadratic paths.
  const arc = Math.PI * r;
  const fraction = Math.max(0, Math.min(1, value / max));

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size / 2 + 16}`} className="w-full max-w-[220px] h-auto" role="img">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${arc * fraction} ${arc}`}
          style={{ transition: 'stroke-dasharray 700ms ease' }}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="30" fill="var(--text)" fontWeight="500">
          {formatValue(value)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {label}
        </text>
      </svg>
      {caption && <p className="text-xs text-muted text-center mt-1">{caption}</p>}
    </div>
  );
}
