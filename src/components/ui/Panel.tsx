// The small vocabulary every screen is built from: a titled glass panel, a KPI
// tile, a page header, a pill and a loading placeholder. Kept together because
// they are only meaningful as a set — changing the panel radius here changes
// every screen at once, which is the point.

import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Panel({ title, sub, action, children, className = '', id }: PanelProps) {
  return (
    <section id={id} className={`liquid-glass rounded-2xl p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] sm:text-base font-medium leading-snug">{title}</h2>}
            {sub && <p className="text-[12.5px] text-[color:var(--muted)] mt-1 leading-relaxed">{sub}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  color?: string;
  trend?: number | null;
}

export function StatTile({ label, value, unit, hint, color, trend }: StatTileProps) {
  return (
    <div className="liquid-glass rounded-xl p-3.5 flex flex-col gap-1">
      <span className="text-[11.5px] uppercase tracking-[0.1em] text-[color:var(--muted)]">{label}</span>
      <span className="text-[26px] leading-none font-medium tabular-nums" style={color ? { color } : undefined}>
        {value}
        {unit && <span className="text-[14px] text-[color:var(--muted)] ml-1">{unit}</span>}
      </span>
      {trend != null && (
        // Cleaner air is the good direction, so a falling number is green —
        // the opposite of the usual "up is good" convention.
        <span
          className="text-[12px] tabular-nums"
          style={{ color: trend > 0 ? 'var(--bad)' : trend < 0 ? 'var(--good)' : 'var(--muted)' }}
        >
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}% за сутки
        </span>
      )}
      {hint && <span className="text-[12px] text-[color:var(--muted)] leading-snug">{hint}</span>}
    </div>
  );
}

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, title, sub, children }: PageHeaderProps) {
  return (
    <header className="mb-5">
      <p className="text-[11.5px] tracking-[0.16em] uppercase text-[color:var(--muted)] mb-2">{eyebrow}</p>
      <h1
        className="font-normal leading-[1.08] mb-2"
        style={{ letterSpacing: '-0.03em', fontSize: 'clamp(28px, 4.2vw, 44px)' }}
      >
        {title}
      </h1>
      {sub && <p className="text-gray-400 text-[14.5px] max-w-2xl leading-relaxed">{sub}</p>}
      {children}
    </header>
  );
}

export function Chip({
  children,
  color,
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  color?: string;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const cls =
    'inline-flex items-center gap-2 text-[12.5px] rounded-full px-3.5 py-1.5 border transition-colors ' +
    (active
      ? 'border-white/35 bg-white/[0.12] text-white'
      : 'border-white/15 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]');
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} title={title}>
      {color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  ) : (
    <span className={cls} title={title}>
      {color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`animate-pulse flex flex-col gap-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3.5 rounded bg-white/[0.06]"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[color:var(--muted)] py-6 text-center">{children}</p>;
}
