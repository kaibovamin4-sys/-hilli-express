// Non-colour encoding for the three air-quality bands.
//
// Green / amber / red is the worst possible triple for red-green colour
// vision deficiency (~8% of men), and this app asks people to make a decision
// from that colour — whether to take a child outside. Every place a band was
// shown as a bare coloured dot now shows a distinct *shape* as well:
//
//   good  circle    — round, settled, nothing to look at
//   mid   diamond   — a corner turned up, something to notice
//   bad   triangle  — the universal warning silhouette
//
// The shapes are ordered by visual sharpness on purpose, so the severity is
// readable in greyscale, in a screenshot, and by someone who cannot separate
// the hues at all. `BandMark` carries an accessible label unless the caller
// puts the word next to it, in which case the mark is decorative.

import type { ReactNode } from 'react';
import { BAND_COLOR, BAND_LABEL, BAND_RANGE, METRIC_LABEL, type Band } from '../charts/primitives';

interface BandMarkProps {
  band: Band;
  size?: number;
  /** Set when the band word is already rendered beside the mark. */
  decorative?: boolean;
  className?: string;
}

export function BandMark({ band, size = 11, decorative = false, className = '' }: BandMarkProps) {
  const color = BAND_COLOR[band];
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': BAND_LABEL[band] };

  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      {...a11y}
    >
      {band === 'good' && <circle cx="6" cy="6" r="5" fill={color} />}
      {band === 'mid' && <path d="M6 0.7 11.3 6 6 11.3 0.7 6Z" fill={color} />}
      {band === 'bad' && <path d="M6 0.9 11.6 10.8H0.4Z" fill={color} />}
    </svg>
  );
}

/** Mark plus the band word — the default way to show a band inline. */
export function BandTag({
  band,
  children,
  className = '',
}: {
  band: Band;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <BandMark band={band} decorative />
      <span style={{ color: BAND_COLOR[band] }}>{children ?? BAND_LABEL[band]}</span>
    </span>
  );
}

/**
 * The scale itself, spelled out.
 *
 * A legend that says only "green / amber / red" leaves the reader to guess
 * which quantity is being banded — and this app bands two. Naming the metric
 * and printing the thresholds is what stops the same three colours from
 * meaning two different things on two screens.
 */
export function BandLegend({ metric }: { metric: 'pm' | 'aqi' }) {
  const bands: Band[] = ['good', 'mid', 'bad'];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-2xs uppercase tracking-[0.12em] text-muted">
        {METRIC_LABEL[metric]}
      </span>
      {bands.map((b) => (
        <span
          key={b}
          className="inline-flex items-center gap-2 text-sm text-gray-300 border border-line rounded-full px-3 py-1.5 bg-fill"
        >
          <BandMark band={b} decorative />
          {BAND_LABEL[b]} · {BAND_RANGE[metric][b]}
        </span>
      ))}
    </div>
  );
}
