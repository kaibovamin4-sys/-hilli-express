// App shell. Five screens behind a tab bar, plus the pieces that must survive
// navigation: the status colour that tints the whole UI, the atmospheric
// background, and the chat widget.
//
// The old single-page landing now lives at /about, reachable from the footer —
// its content still explains the project, but it is no longer the thing people
// land in when they only want to know whether to go outside.

import { useEffect } from 'react';
import { asKey } from './lib/api';
import { statusCopyFor } from './lib/air';
import { AppStateProvider, useApp } from './lib/appState';
import { useRoute, navigate } from './lib/router';
import AppNav from './components/nav/AppNav';
import ChatWidget from './components/ChatWidget';
import NowPage from './pages/NowPage';
import MapPage from './pages/MapPage';
import ForecastPage from './pages/ForecastPage';
import StationsPage from './pages/StationsPage';
import DashboardPage from './pages/DashboardPage';
import AboutPage from './pages/AboutPage';

function Screen() {
  const { segments } = useRoute();
  switch (segments[0]) {
    case undefined:
      return <NowPage />;
    case 'map':
      return <MapPage />;
    case 'forecast':
      return <ForecastPage />;
    case 'stations':
      return <StationsPage />;
    case 'dashboard':
      return <DashboardPage />;
    case 'about':
      return <AboutPage />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  return (
    <div className="liquid-glass rounded-2xl p-8 text-center">
      <p className="text-[15px] mb-3">Такого экрана нет.</p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="bg-white text-black px-5 py-2 rounded-lg text-sm font-medium"
      >
        На главную
      </button>
    </div>
  );
}

function Shell() {
  const { place, status } = useApp();
  const copy = statusCopyFor(status ? asKey(status.status) : 'good');

  // One CSS variable drives every accent in the app — nav highlight, chart
  // lines, gauge arcs — so the whole interface shifts colour with the air.
  useEffect(() => {
    document.documentElement.style.setProperty('--status-c', copy.cssVar);
  }, [copy.cssVar]);

  return (
    <>
      <div className="haze" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="relative z-[1] min-h-screen flex flex-col">
        <AppNav statusColor={copy.cssVar} />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 md:pt-2">
          <Screen />
        </main>

        <footer className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 mt-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-[color:var(--muted)]">
            <button type="button" onClick={() => navigate('/about')} className="hover:text-white transition-colors">
              О проекте
            </button>
            <span>AUA · гиперлокальный мониторинг воздуха в Алматы</span>
          </div>
        </footer>

        {/* Clearance for the fixed bottom tab bar, so the last line of every
            screen stays readable on a phone. */}
        <div className="h-24 md:h-0" aria-hidden="true" />
      </div>

      <ChatWidget place={place} />
    </>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
