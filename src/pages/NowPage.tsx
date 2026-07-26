// "Сейчас" — the five-second answer, then everything that backs it up.
//
// Order is deliberate: verdict first, then where that verdict came from, then
// what to do about it. Someone who only reads the top of the screen still gets
// the one thing they came for.

import { useEffect, useState } from 'react';
import { api, aqiToPm, asKey, type WalkSpot } from '../lib/api';
import { statusCopyFor } from '../lib/air';
import { useApp } from '../lib/appState';
import { navigate } from '../lib/router';
import Hero from '../components/hero/Hero';
import PlacePicker from '../components/PlacePicker';
import BringList from '../components/BringList';
import { Chip, EmptyState, Panel, Skeleton, StatTile } from '../components/ui/Panel';
import Gauge from '../components/charts/Gauge';
import { pmBand, pmColorVar } from '../components/charts/primitives';
import { BandMark } from '../components/ui/Band';
import { RecIcon } from '../components/ui/RecIcon';

const PRIORITY_COLOR: Record<string, string> = {
  danger: 'var(--bad)',
  warn: 'var(--mid)',
  advice: 'var(--good)',
  info: 'var(--muted)',
};

// congestionAt() reports 0..10 for the nearest corridor, with these bands.
const TRAFFIC_LABEL: Record<string, string> = {
  free: 'свободно',
  moderate: 'умеренно',
  heavy: 'плотно',
  jam: 'пробка',
};

const POLLEN_LABEL: Record<string, string> = {
  none: 'нет',
  low: 'низкая',
  moderate: 'средняя',
  high: 'высокая',
  very_high: 'очень высокая',
};

function timeRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${f(start)} — ${f(end)}`;
}

export default function NowPage() {
  const { place, status, statusLoading, profile } = useApp();
  const [spots, setSpots] = useState<WalkSpot[] | null>(null);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    setSpots(null);
    void api
      .walkSpots(place, 4)
      .then((s) => {
        if (alive) setSpots(s);
      })
      .catch(() => {
        if (alive) setSpots([]);
      });
    return () => {
      alive = false;
    };
  }, [place]);

  const copy = statusCopyFor(status ? asKey(status.status) : 'good');
  const pm25 = status?.fusion?.pm25 ?? status?.external.air_quality?.pm2_5 ?? null;
  const weather = status?.external.weather ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Hero />

      <div id="place-picker" className="scroll-mt-24">
        <PlacePicker />
      </div>

      {/* Detail behind the verdict. The verdict word and its one-line meaning
          now live in the hero directly above, so repeating them here would put
          the same sentence on screen twice; this panel keeps only what the hero
          has no room for — the specific numbers the estimate rests on. */}
      <Panel title="Детали оценки">
        {statusLoading && !status ? (
          <Skeleton lines={3} />
        ) : status ? (
          <>
            <p className="text-base text-gray-300 leading-relaxed">
              {status.status_reason}. Оценка{' '}
              {status.local.based_on === 'measurement' ? 'по измерению' : 'интерполирована'}, уверенность{' '}
              {Math.round(status.confidence * 100)} %
              {status.local.nearest_post &&
                ` · ближайший пост «${status.local.nearest_post.name}», ${status.local.nearest_post.distance_km} км`}
              .
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              <Chip color={copy.cssVar}>Безопасно ~{status.max_safe_duration_min} мин на улице</Chip>
              {status.is_blind_zone && <Chip color="var(--bad)">Слепая зона сети</Chip>}
              <Chip onClick={() => navigate('/forecast')}>Прогноз на 6 часов →</Chip>
            </div>
          </>
        ) : (
          <EmptyState>Выберите район или введите адрес, чтобы увидеть оценку.</EmptyState>
        )}
      </Panel>

      {/* Numbers behind the verdict */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="PM2.5"
          value={pm25 == null ? '—' : Math.round(pm25)}
          unit="µg/m³"
          color={pm25 == null ? undefined : pmColorVar(pm25)}
          hint="норма ВОЗ — до 15"
        />
        <StatTile
          label="Температура"
          value={weather ? Math.round(weather.temperature_c) : '—'}
          unit="°C"
          hint={weather ? `ощущается ${Math.round(weather.apparent_c)} °C` : undefined}
        />
        <StatTile
          label="Влажность"
          value={weather ? Math.round(weather.humidity) : '—'}
          unit="%"
          hint={weather ? `ветер ${weather.wind_speed_ms.toFixed(1)} м/с` : undefined}
        />
        <StatTile
          label="УФ-индекс"
          value={weather ? Math.round(weather.uv_index) : '—'}
          hint={
            status?.external.pollen
              ? `пыльца: ${POLLEN_LABEL[status.external.pollen.max_level] ?? status.external.pollen.max_level}`
              : undefined
          }
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* What to bring */}
        <Panel
          title="Что взять с собой"
          sub="Список собирается из погоды, воздуха и выбранного профиля."
        >
          {status ? <BringList status={status} profile={profile} /> : <Skeleton lines={4} />}
        </Panel>

        <div className="flex flex-col gap-4">
          {/* Walk window */}
          <Panel title="Когда лучше выйти">
            {status?.best_walk_window ? (
              <div className="flex items-center gap-4">
                <Gauge
                  value={status.max_safe_duration_min}
                  max={180}
                  color={copy.cssVar}
                  label="минут безопасно"
                  size={150}
                />
                <div className="min-w-0">
                  <p className="text-xl leading-tight mb-1">
                    {timeRange(status.best_walk_window.start, status.best_walk_window.end)}
                  </p>
                  <p className="text-sm text-muted leading-relaxed">
                    {status.best_walk_window.reason}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState>Окно прогулки появится, когда подтянется почасовой прогноз.</EmptyState>
            )}
          </Panel>

          {/* City layers */}
          <Panel title="Слои города">
            {status?.city ? (
              <ul className="flex flex-col gap-2.5 text-sm">
                <li className="flex items-start justify-between gap-3">
                  <span className="text-muted">Пробки</span>
                  <span className="text-right">
                    {TRAFFIC_LABEL[status.city.traffic.level] ?? status.city.traffic.level} · индекс{' '}
                    {status.city.traffic.index} из 10
                    {status.city.traffic.is_rush_hour && ' · час пик'}
                    {status.city.traffic.nearest_corridor && (
                      <span className="block text-muted text-xs">
                        {status.city.traffic.nearest_corridor.name},{' '}
                        {status.city.traffic.nearest_corridor.distance_km} км
                      </span>
                    )}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span className="text-muted">Стройки</span>
                  <span className="text-right">
                    {status.city.construction.inside_zone ? 'вы в зоне пыли' : 'рядом нет'}
                    {status.city.construction.nearest && (
                      <span className="block text-muted text-xs">
                        {status.city.construction.nearest.name}, {status.city.construction.nearest.distance_km} км
                      </span>
                    )}
                  </span>
                </li>
                {status.fusion && (
                  <li className="flex items-start justify-between gap-3">
                    <span className="text-muted">Как посчитан PM2.5</span>
                    <span className="text-right">
                      фон {Math.round(status.fusion.background_pm25)}{' '}
                      {status.fusion.local_correction >= 0 ? '+' : '−'}{' '}
                      {Math.abs(Math.round(status.fusion.local_correction * 10) / 10)} от станций
                    </span>
                  </li>
                )}
              </ul>
            ) : (
              <Skeleton lines={3} />
            )}
          </Panel>
        </div>
      </div>

      {/* Recommendations */}
      <Panel title="Рекомендации" sub="Пересчитываются под выбранный профиль на сервере.">
        {status ? (
          status.recommendations.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {status.recommendations.map((r) => (
                <div
                  key={`${r.category}-${r.title}`}
                  className="rounded-xl border border-line bg-fill p-3.5"
                  style={{ borderLeft: `3px solid ${PRIORITY_COLOR[r.priority] ?? 'var(--muted)'}` }}
                >
                  <p className="text-base mb-1 flex items-start gap-2.5">
                    <span
                      className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-fill-hover"
                      style={{ color: PRIORITY_COLOR[r.priority] ?? 'var(--muted)' }}
                    >
                      <RecIcon icon={r.icon} size={14} />
                    </span>
                    {r.title}
                  </p>
                  <p className="text-sm text-muted leading-relaxed">{r.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Особых рекомендаций нет — условия спокойные.</EmptyState>
          )
        ) : (
          <Skeleton lines={4} />
        )}
      </Panel>

      {/* Walk spots teaser */}
      <Panel
        title="Куда пойти рядом"
        action={
          <button
            type="button"
            onClick={() => navigate('/map')}
            className="tap-target cursor-pointer text-sm text-gray-300 border border-line rounded-full px-3.5 py-1.5 bg-fill hover:bg-fill-hover transition-colors"
          >
            На карте
          </button>
        }
      >
        {spots == null ? (
          <Skeleton lines={3} />
        ) : spots.length === 0 ? (
          <EmptyState>Не удалось загрузить места для прогулки.</EmptyState>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {spots.map((s) => (
              <div key={s.id} className="rounded-xl border border-line bg-fill p-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-base">{s.name}</span>
                  <span
                    className="text-xs shrink-0 inline-flex items-center gap-1.5"
                    style={{ color: pmColorVar(s.pm25_estimate) }}
                  >
                    <BandMark band={pmBand(s.pm25_estimate)} decorative />
                    {s.verdict}
                  </span>
                </div>
                {/* The backend's reason string already spells out PM2.5 and
                    distance, so repeating them here would just be noise. */}
                <p className="text-sm text-muted leading-relaxed">{s.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Transparency */}
      {status && status.local.contributing_posts.length > 0 && (
        <Panel title="Откуда взялась оценка" sub="Вклад каждого поста в цифру выше.">
          <ul className="flex flex-col gap-2">
            {status.local.contributing_posts.map((c) => (
              <li key={c.device_id} className="flex items-center gap-3 text-sm">
                <span className="w-[130px] shrink-0 truncate text-gray-300">{c.name}</span>
                <div className="flex-1 h-2 rounded-full bg-fill overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(c.weight * 100)}%`,
                      background: pmColorVar(aqiToPm(c.value)),
                    }}
                  />
                </div>
                <span className="w-[92px] shrink-0 text-right text-muted tabular-nums">
                  {Math.round(c.weight * 100)}% · {c.distance_km} км
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="text-xs text-muted leading-relaxed px-1">
        Это индикатор, а не медицинский прибор. PM2.5 — модель Open-Meteo, скорректированная нашими
        станциями; MQ-сенсоры детектируют горючие газы и дым, а не пыль.
      </p>
    </div>
  );
}
