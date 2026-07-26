// Tab-bar icons. Inline SVG rather than an icon package: five glyphs at one
// size don't justify a dependency, and `currentColor` lets the active tab
// colour come from the status ramp without a second set of assets.

interface IconProps {
  className?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function NowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function MapIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4z" />
      <path d="M9 4v13M15 7v12.5" />
    </svg>
  );
}

export function ForecastIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 16.5l4.5-5 3.5 3.5L20 6" />
      <path d="M20 10.5V6h-4.5" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function StationsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="11" r="2.2" />
      <path d="M8.2 7.2a5.4 5.4 0 000 7.6M15.8 7.2a5.4 5.4 0 010 7.6" />
      <path d="M5.6 4.6a9 9 0 000 12.8M18.4 4.6a9 9 0 010 12.8" />
      <path d="M12 13.2V21" />
    </svg>
  );
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.6" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.6" />
    </svg>
  );
}
