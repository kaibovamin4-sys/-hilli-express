// The hero: liquid glass over a looping video, in the Bloom visual language.
//
// Two deliberate departures from the reference spec, both because AUA is a
// working instrument rather than a brochure:
//
//   · Colour. The spec calls for strict grayscale. Everything here obeys that
//     except the verdict word, the mark's dot and the sparkline — because in
//     this product green/amber/red *is* the answer, not decoration. Against an
//     otherwise colourless hero the one coloured word carries more weight, not
//     less.
//   · The nav row shows the chosen district instead of repeating the logo. The
//     app shell already renders a logo and a tab bar directly above this
//     section; a second "aua" sixty pixels below the first reads as a bug.
//
// The right panel is filled with live readings rather than marketing cards, so
// the first screen doubles as proof that the network is actually running.

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, MapPin, Plus, Sparkles, Wind } from 'lucide-react';
import { api, asKey, type MlForecast, type StatusKey } from '../../lib/api';
import { statusCopyFor } from '../../lib/air';
import { useApp } from '../../lib/appState';
import { navigate } from '../../lib/router';
import Sparkline from '../charts/Sparkline';
import Mark from './Mark';

// The headline is the verdict, split so the second half can take the serif
// italic the way the reference does.
const HERO_TITLE: Record<StatusKey, [string, string]> = {
  good: ['Можно', 'гулять'],
  mid: ['Недолго', 'на воздухе'],
  bad: ['Лучше', 'дома'],
};

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Hero() {
  const { status, statusLoading, place, devices } = useApp();
  const [forecast, setForecast] = useState<MlForecast | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The `autoplay` attribute is evaluated when the browser first sees the
  // element; this component mounts after hydration, so on some engines the
  // video ends up ready-but-paused and never starts on its own.
  //
  // Nudging it once on mount isn't enough either — at that moment the source
  // may still be loading and play() rejects. So we also retry on `canplay`,
  // and again when the tab is brought back to the foreground (browsers pause
  // background video and don't always resume it). Every attempt swallows its
  // rejection: a blocked play (autoplay policy, data saver) is not an error
  // worth surfacing, and the scrim plus gradient still make a good backdrop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tryPlay = () => void video.play().catch(() => {});
    tryPlay();

    video.addEventListener('canplay', tryPlay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryPlay();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      video.removeEventListener('canplay', tryPlay);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    void api
      .mlForecast(place, 6)
      .then((f) => {
        if (alive) setForecast(f);
      })
      .catch(() => {
        // The hero must still render without a forecast; the panel hides it.
      });
    return () => {
      alive = false;
    };
  }, [place]);

  const key = status ? asKey(status.status) : 'good';
  const copy = statusCopyFor(key);
  const [line1, line2] = HERO_TITLE[key];
  const ready = status != null;

  const pm25 = status?.fusion?.pm25 ?? status?.external.air_quality?.pm2_5 ?? null;
  const weather = status?.external.weather ?? null;
  const nearest = status?.local.nearest_post ?? null;
  const forecastPoints = forecast?.points ?? [];
  const forecastLast = forecastPoints[forecastPoints.length - 1] ?? null;

  return (
    <section className="relative -mx-4 sm:-mx-6 lg:-mx-10 min-h-[70vh] lg:min-h-[calc(100vh-5rem)] overflow-hidden">
      {/* Video sits at z-0, everything else floats above it. */}
      <video
        ref={videoRef}
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src="/hero.mp4"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />
      {/* The clip averages 18% luminance but peaks near white; a fixed scrim
          keeps the headline legible on the brightest frame instead of letting
          contrast swing with the footage. */}
      <div className="absolute inset-0 z-0 bg-black/45" aria-hidden="true" />
      <div
        className="absolute inset-x-0 bottom-0 z-0 h-32"
        style={{ background: 'linear-gradient(180deg, transparent, var(--bg))' }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-[70vh] lg:min-h-[calc(100vh-5rem)]">
        {/* ── Left panel ─────────────────────────────────────────────── */}
        <div className="relative w-full lg:w-[52%]">
          <div className="absolute inset-4 lg:inset-6 rounded-3xl hero-glass-strong" />

          <div className="relative z-10 flex h-full flex-col px-8 py-7 lg:px-12 lg:py-12">
            {/* Context row — which place this verdict is about. */}
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 min-w-0">
                <Mark size={26} className="text-white shrink-0" accent={copy.cssVar} />
                <span className="font-display text-[15px] tracking-tight text-white truncate">
                  {place?.label ?? 'Алматы'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  document.getElementById('place-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="hero-glass shrink-0 rounded-full px-4 py-2 font-display text-xs text-white/80 transition-transform hover:scale-105"
              >
                Сменить
              </button>
            </div>

            {/* Centre stack */}
            {/* Tighter on phones so the section below stays visible under the
                fold — the peek is what tells someone there is more to scroll. */}
            <div className="flex flex-1 flex-col items-start justify-center py-7 lg:py-10">
              <Mark size={72} className="mb-7 text-white" accent={copy.cssVar} />

              <h1
                className="font-display font-medium leading-[0.95] tracking-[-0.05em] text-white"
                style={{ fontSize: 'clamp(44px, 7vw, 76px)' }}
              >
                {ready ? line1 : 'Проверяем'}
                <br />
                <em
                  className="font-serif italic"
                  style={{ color: ready ? copy.cssVar : 'rgba(255,255,255,0.8)' }}
                >
                  {ready ? line2 : 'воздух'}
                </em>
              </h1>

              <p className="mt-5 max-w-md font-display text-[14.5px] leading-relaxed text-white/60">
                {ready
                  ? copy.sub
                  : statusLoading
                    ? 'Считаем оценку по вашему району…'
                    : 'Выберите район или введите адрес ниже.'}
              </p>

              <button
                type="button"
                onClick={() => navigate('/map')}
                className="hero-glass-strong mt-8 flex items-center gap-3 rounded-full py-2 pl-6 pr-2 font-display text-[15px] text-white transition-transform hover:scale-105 active:scale-95"
              >
                Смотреть карту
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  <ArrowUpRight size={15} />
                </span>
              </button>

              <div className="mt-7 flex flex-wrap gap-2">
                {[
                  `${devices.length || '—'} станций`,
                  'Прогноз 6 часов',
                  '8 районов',
                ].map((label) => (
                  <span
                    key={label}
                    className="hero-glass rounded-full px-4 py-1.5 font-display text-xs text-white/80"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Provenance block — the reference puts a quote here; ours states
                where the number came from, which is the same gesture of
                authorship applied to data. */}
            <div>
              <p className="font-display text-xs uppercase tracking-widest text-white/50">
                Откуда оценка
              </p>
              <p className="mt-2.5 max-w-sm text-[17px] leading-snug text-white/80">
                <span className="font-display">Городской фон </span>
                <span className="font-serif italic">плюс поправки</span>
                <span className="font-display"> наших станций.</span>
              </p>
              <div className="mt-4 flex items-center gap-3">
                <span className="h-px w-8 bg-white/25" />
                <span className="font-display text-[11px] uppercase tracking-widest text-white/50">
                  AUA · Алматы
                </span>
                <span className="h-px flex-1 bg-white/25" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Right panel (desktop only) ─────────────────────────────── */}
        <div className="hidden w-[48%] flex-col gap-4 py-6 pr-6 lg:flex">
          <div className="flex items-center justify-end gap-2.5">
            <span className="hero-glass flex items-center gap-3 rounded-full py-2 pl-5 pr-2 font-display text-xs text-white/80">
              Обновлено {status ? hhmm(new Date(status.ts)) : '—'}
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                aria-label="Открыть дэшборд"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white transition-transform hover:scale-105"
              >
                <ArrowRight size={14} />
              </button>
            </span>
            <button
              type="button"
              onClick={() => navigate('/forecast')}
              aria-label="Открыть прогноз"
              className="hero-glass flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
            >
              <Sparkles size={16} />
            </button>
          </div>

          <div className="hero-glass ml-auto w-56 rounded-3xl p-5">
            <p className="font-display text-[13.5px] font-medium text-white">Ближайший пост</p>
            <p className="mt-1.5 font-display text-xs leading-relaxed text-white/60">
              {nearest
                ? `${nearest.name} — ${nearest.distance_km} км. ${
                    status?.local.based_on === 'measurement' ? 'Прямое измерение.' : 'Оценка интерполирована.'
                  }`
                : 'Определяем ближайшую станцию сети.'}
            </p>
          </div>

          {/* Feature block, pinned to the bottom like the reference. */}
          <div className="hero-glass mt-auto rounded-[2.5rem] p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="hero-glass rounded-3xl p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
                  <Wind size={15} />
                </span>
                <p className="mt-3.5 font-display text-[13px] text-white/60">PM2.5 сейчас</p>
                <p
                  className="font-display text-[26px] leading-tight tracking-tight"
                  style={{ color: pm25 == null ? '#fff' : copy.cssVar }}
                >
                  {pm25 == null ? '—' : Math.round(pm25)}
                  <span className="ml-1 text-[13px] text-white/50">µg/m³</span>
                </p>
                <p className="font-display text-[11.5px] text-white/50">
                  {weather ? `${Math.round(weather.temperature_c)} °C · ${Math.round(weather.humidity)} %` : 'норма ВОЗ — 15'}
                </p>
              </div>

              <div className="hero-glass rounded-3xl p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
                  <MapPin size={15} />
                </span>
                <p className="mt-3.5 font-display text-[13px] text-white/60">Через 6 часов</p>
                <p className="font-display text-[26px] leading-tight tracking-tight text-white">
                  {forecastLast ? forecastLast.aqi : '—'}
                  <span className="ml-1 text-[13px] text-white/50">AQI</span>
                </p>
                {forecastPoints.length > 1 ? (
                  <div className="mt-1 -ml-1">
                    <Sparkline
                      values={forecastPoints.map((p) => p.aqi)}
                      color={copy.cssVar}
                      width={96}
                      height={22}
                    />
                  </div>
                ) : (
                  <p className="font-display text-[11.5px] text-white/50">модель обучается</p>
                )}
              </div>
            </div>

            <div className="hero-glass mt-3 flex items-center gap-4 rounded-3xl p-3">
              <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06]">
                <Mark size={40} className="text-white" accent={copy.cssVar} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[13.5px] font-medium text-white">
                  Безопасно ~{status?.max_safe_duration_min ?? '—'} мин
                </p>
                <p className="mt-0.5 font-display text-[11.5px] leading-relaxed text-white/60">
                  Длительность считается под выбранный профиль.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/stations')}
                aria-label="Открыть станции"
                className="hero-glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
