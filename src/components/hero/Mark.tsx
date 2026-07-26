// The AUA mark: a station and the ring of city it actually speaks for.
//
// Drawn as inline SVG rather than shipped as /logo.png so it stays sharp at
// every size, weighs nothing, and — the reason that matters here — can inherit
// the status colour. The mark itself turns green, amber or red with the air,
// which is the one place colour is allowed into an otherwise grayscale hero.

interface MarkProps {
  size?: number;
  className?: string;
  /** Colour of the innermost dot. The rings stay neutral. */
  accent?: string;
}

export default function Mark({ size = 32, className, accent = 'currentColor' }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Coverage rings — fading outward, the way a station's confidence does. */}
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" />
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1" />
      <circle cx="16" cy="16" r="5.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" />
      {/* The post itself. */}
      <circle cx="16" cy="16" r="2.6" fill={accent} />
    </svg>
  );
}
