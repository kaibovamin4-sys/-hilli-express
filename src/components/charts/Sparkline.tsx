// Tiny inline trend, for table rows and station cards. No axes on purpose:
// at this size the shape is the message and any decoration would crowd it out.

import { linePath, linearScale, type Pt } from './primitives';

interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  /** Fill the area under the line — reads better against a card background. */
  fill?: boolean;
}

export default function Sparkline({ values, color, width = 110, height = 30, fill = true }: SparklineProps) {
  if (values.length < 2) {
    return <span className="text-[color:var(--muted)] text-[11px]">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = linearScale([0, values.length - 1], [1, width - 1]);
  // Pad the domain so a flat series doesn't sit on the very edge of the box.
  const y = linearScale([min - (max - min) * 0.15 || min - 1, max], [height - 2, 2]);
  const points = values.map((v, i) => [x(i), y(v)] as Pt);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      {fill && (
        <path
          d={`${linePath(points)} L${width - 1},${height} L1,${height} Z`}
          fill={color}
          opacity="0.14"
        />
      )}
      <path d={linePath(points)} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
