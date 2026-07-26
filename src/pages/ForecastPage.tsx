// "Прогноз" — six hours ahead, plus an honest account of how good that
// forecast actually is.
//
// The model card is not decoration. A forecast without an error bar invites
// more trust than it has earned, so the validation MAE, the comparison against
// the do-nothing baseline and the feature importances are on the same screen
// as the numbers they qualify.

import { useEffect, useState } from 'react';
import { api, asKey, type MlForecast } from '../lib/api';
import { statusCopyFor } from '../lib/air';
import { useApp } from '../lib/appState';
import PlacePicker from '../components/PlacePicker';
import { Chip, EmptyState, Panel, PageHeader, Skeleton, StatTile } from '../components/ui/Panel';
import LineChart from '../components/charts/LineChart';
import BarChart from '../components/charts/BarChart';
import { AQI_BAD, AQI_GOOD, aqiColor, hhmm } from '../components/charts/primitives';

export default function ForecastPage() {
  const { place } = useApp();
  const [data, setData] = useState<MlForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    setData(null);
    setError(null);
    void api
      .mlForecast(place, 6)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError('Не удалось получить прогноз');
      });
    return () => {
      alive = false;
    };
  }, [place]);

  const points = data?.points ?? [];
  const worst = points.reduce<typeof points[number] | null>(
    (acc, p) => (acc == null || p.aqi > acc.aqi ? p : acc),
    null,
  );
  const best = points.reduce<typeof points[number] | null>(
    (acc, p) => (acc == null || p.aqi < acc.aqi ? p : acc),
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Прогноз · 6 часов"
        title="Что будет с воздухом дальше"
        sub="Модель машинного обучения учится на истории наших станций и на почасовом прогнозе погоды: ветре, температуре, давлении и облачности на целевой час."
      />

      <PlacePicker compact />

      {error && <EmptyState>{error}</EmptyState>}
      {!data && !error && <Skeleton lines={6} className="liquid-glass rounded-2xl p-5" />}

      {data && (
        <>
          {data.fallback && (
            <div
              className="liquid-glass rounded-2xl p-4 text-sm leading-relaxed"
              style={{ borderLeft: '3px solid var(--mid)' }}
            >
              <b>Показан резервный прогноз</b> (экспоненциальное сглаживание Хольта + Open-Meteo).
              ML-модель сейчас недоступна: {data.fallback_reason}. Она обучается на старте сервера и
              переобучается каждые 30 минут — обновите страницу через пару минут.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Сейчас"
              value={points[0]?.baseline_aqi ?? '—'}
              hint="AQI-композит станции"
            />
            <StatTile
              label="Через 6 часов"
              value={points[points.length - 1]?.aqi ?? '—'}
              color={points.length ? aqiColor(points[points.length - 1]!.aqi) : undefined}
              hint={
                points.length
                  ? `PM2.5 ≈ ${points[points.length - 1]!.pm25} µg/m³`
                  : undefined
              }
            />
            <StatTile
              label="Лучший час"
              value={best ? hhmm(best.ts) : '—'}
              color="var(--good)"
              hint={best ? `AQI ${best.aqi}` : undefined}
            />
            <StatTile
              label="Худший час"
              value={worst ? hhmm(worst.ts) : '—'}
              color={worst ? aqiColor(worst.aqi) : undefined}
              hint={worst ? `AQI ${worst.aqi}` : undefined}
            />
          </div>

          <Panel
            title="Прогноз AQI"
            sub={
              <>
                Затенённая полоса — интервал ±1σ по остаткам модели на отложенной выборке. Пунктир —
                «ничего не изменится», с которым модель сравнивается.
              </>
            }
            action={<Chip color={data.fallback ? 'var(--mid)' : 'var(--good)'}>{data.fallback ? 'резерв' : 'ML'}</Chip>}
          >
            <LineChart
              labels={points.map((p) => hhmm(p.ts))}
              yMin={0}
              height={280}
              series={[
                {
                  key: 'forecast',
                  label: 'Прогноз',
                  color: 'var(--status-c)',
                  values: points.map((p) => p.aqi),
                  fill: true,
                },
                {
                  key: 'baseline',
                  label: 'Без изменений',
                  color: 'rgba(154,164,176,0.85)',
                  values: points.map((p) => p.baseline_aqi),
                  dashed: true,
                },
              ]}
              band={{
                lower: points.map((p) => p.aqi_low),
                upper: points.map((p) => p.aqi_high),
                color: 'var(--status-c)',
              }}
              guides={[
                { value: AQI_GOOD, label: 'умеренный', color: 'var(--mid)' },
                { value: AQI_BAD, label: 'вредный', color: 'var(--bad)' },
              ]}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4">
              {points.map((p) => {
                const copy = statusCopyFor(asKey(p.status));
                return (
                  <div
                    key={p.ts}
                    className="rounded-xl border border-line bg-fill p-3"
                    style={{ borderTop: `2px solid ${copy.cssVar}` }}
                  >
                    <p className="text-xs text-muted">
                      {hhmm(p.ts)} · +{p.horizon} ч
                    </p>
                    <p className="text-xl leading-tight tabular-nums" style={{ color: copy.cssVar }}>
                      {p.aqi}
                    </p>
                    <p className="text-xs text-muted leading-snug">
                      PM2.5 ≈ {p.pm25}
                      <br />
                      ±{p.aqi_high - p.aqi} · увер. {Math.round(p.confidence * 100)}%
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>

          {!data.fallback && data.model.accuracy.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Panel
                title="Точность по горизонтам"
                sub="MAE на отложенной выборке (последние 25 % часов, модель их не видела). Ниже — лучше."
              >
                <BarChart
                  height={210}
                  bars={data.model.accuracy.map((a) => ({
                    label: `+${a.horizon} ч`,
                    value: a.mae,
                    // A forecast only earns its place if it beats persistence;
                    // colour says whether it did, per horizon.
                    color: a.mae < a.baseline_mae ? 'var(--good)' : 'var(--mid)',
                    sub: `база ${a.baseline_mae}`,
                  }))}
                />
                <div className="scroll-x mt-3 -mx-1 px-1">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Точность модели по горизонтам прогноза</caption>
                    <thead>
                      <tr className="text-muted text-left">
                        <th scope="col" className="font-normal py-1.5">Горизонт</th>
                        <th scope="col" className="font-normal py-1.5 text-right">MAE</th>
                        <th scope="col" className="font-normal py-1.5 text-right hidden sm:table-cell">RMSE</th>
                        <th scope="col" className="font-normal py-1.5 text-right hidden sm:table-cell">R²</th>
                        <th scope="col" className="font-normal py-1.5 text-right">vs база</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.model.accuracy.map((a) => (
                        <tr key={a.horizon} className="border-t border-line-soft">
                          <td className="py-1.5">+{a.horizon} ч</td>
                          <td className="py-1.5 text-right tabular-nums">{a.mae}</td>
                          <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{a.rmse}</td>
                          <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{a.r2}</td>
                          <td
                            className="py-1.5 text-right tabular-nums"
                            style={{
                              color: a.improvement_vs_baseline > 0 ? 'var(--good)' : 'var(--bad)',
                            }}
                          >
                            {a.improvement_vs_baseline > 0 ? '−' : '+'}
                            {Math.abs(a.improvement_vs_baseline)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                title="На что модель смотрит"
                sub="Доля объяснённой дисперсии по признакам, суммарно по всем горизонтам."
              >
                <BarChart
                  horizontal
                  unit="%"
                  bars={data.model.importance.map((f) => ({
                    label: f.label,
                    value: Math.round(f.importance * 1000) / 10,
                    color: 'var(--status-c)',
                  }))}
                />
              </Panel>
            </div>
          )}

          <Panel title="Как устроена модель">
            <p className="text-sm text-gray-300 leading-relaxed mb-3">{data.model.method}</p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 text-sm">
              <Fact label="Станция-опора" value={`${data.anchor.station} · ${data.anchor.distance_km} км`} />
              <Fact
                label="Обучена"
                value={new Date(data.model.trained_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <Fact label="Обучающих строк" value={String(data.model.train_rows)} />
              <Fact label="Валидационных" value={String(data.model.validation_rows)} />
              {data.model.hyperparameters && (
                <>
                  <Fact label="Деревьев" value={String(data.model.hyperparameters.rounds)} />
                  <Fact label="Глубина" value={String(data.model.hyperparameters.max_depth)} />
                  <Fact label="Learning rate" value={String(data.model.hyperparameters.learning_rate)} />
                  <Fact label="Subsample" value={String(data.model.hyperparameters.subsample)} />
                </>
              )}
            </dl>
            <p className="text-xs text-muted leading-relaxed mt-3.5">
              Валидация — по времени, а не случайная: последние 25 % часов исключены из обучения
              целиком. Случайное перемешивание подмешало бы соседние часы целевого и дало бы
              заниженную ошибку, которую живой прогноз не смог бы повторить.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-gray-200 mt-0.5">{value}</dd>
    </div>
  );
}
