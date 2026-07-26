// One navigation model, two presentations.
//
// On a phone the tabs live in a fixed bottom bar within thumb reach, the way a
// native app does it. From `md` up that placement is wrong — a mouse starts at
// the top of the window and a 1400px-wide bar of five icons at the bottom edge
// reads as a footer — so the same routes render as a top bar instead. Both are
// driven by the same list, so a route can never appear in one and not the other.

import type { ComponentType } from 'react';
import { useRoute, navigate } from '../../lib/router';
import { DashboardIcon, ForecastIcon, MapIcon, NowIcon, StationsIcon } from './icons';

interface Tab {
  path: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

export const TABS: Tab[] = [
  { path: '/', label: 'Сейчас', Icon: NowIcon },
  { path: '/map', label: 'Карта', Icon: MapIcon },
  { path: '/forecast', label: 'Прогноз', Icon: ForecastIcon },
  { path: '/stations', label: 'Станции', Icon: StationsIcon },
  { path: '/dashboard', label: 'Дэшборд', Icon: DashboardIcon },
];

/** `/stations/aua-medeu-1` should still light up the Станции tab. */
function isActive(tabPath: string, path: string): boolean {
  if (tabPath === '/') return path === '/';
  return path === tabPath || path.startsWith(`${tabPath}/`);
}

interface AppNavProps {
  statusColor: string;
}

export default function AppNav({ statusColor }: AppNavProps) {
  const { path } = useRoute();

  return (
    <>
      {/* Desktop / tablet: top bar */}
      <header className="hidden md:block sticky top-0 z-[900] pt-5 pb-2 px-6 lg:px-10">
        <nav className="liquid-glass liquid-glass--solid rounded-2xl px-4 py-2.5 flex items-center gap-4 max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-baseline gap-2 text-xl font-semibold tracking-tight shrink-0"
          >
            <span
              className="w-2.5 h-2.5 rounded-full self-center transition-colors duration-700"
              style={{ background: statusColor, boxShadow: `0 0 12px ${statusColor}` }}
            />
            AUA
            <small className="text-2xs font-normal text-muted tracking-normal">
              воздух Алматы
            </small>
          </button>

          <div className="flex items-center gap-1 ml-auto">
            {TABS.map(({ path: p, label, Icon }) => {
              const active = isActive(p, path);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => navigate(p)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-colors ${
                    active ? 'bg-fill-active text-white' : 'text-gray-400 hover:text-white hover:bg-fill-hover'
                  }`}
                  style={active ? { color: statusColor } : undefined}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Mobile: bottom tab bar.
          The fixed positioning lives on this wrapper, not on the glass element
          itself: `.liquid-glass` declares `position: relative` and is defined
          after Tailwind's utilities layer, so at equal specificity it would win
          and the bar would scroll away with the page. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-[900]">
        <nav
          className="liquid-glass liquid-glass--solid border-t border-line"
          // iPhones put the home indicator where the bar sits; without the inset
          // the labels are half-covered by it in standalone (installed) mode.
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="grid grid-cols-5">
            {TABS.map(({ path: p, label, Icon }) => {
              const active = isActive(p, path);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => navigate(p)}
                  aria-current={active ? 'page' : undefined}
                  className="flex flex-col items-center gap-1 pt-2.5 pb-2 active:bg-fill-active transition-colors"
                  style={{ color: active ? statusColor : 'var(--muted)' }}
                >
                  <Icon className="w-[22px] h-[22px]" />
                  <span className="text-2xs leading-none">{label}</span>
                  <span
                    className="block h-[2px] w-6 rounded-full transition-opacity"
                    style={{ background: statusColor, opacity: active ? 1 : 0 }}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}
