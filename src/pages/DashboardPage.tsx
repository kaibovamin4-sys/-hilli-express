// "Дэшборд" — the city as numbers.
//
// Every chart type here answers a different shape of question, which is why
// they are different chart types: a line for "what happened", a heatmap for
// "when does it happen", a donut for "how often", horizontal bars for "who is
// worst", a table for "exactly how much". Using one chart type for all of them
// would hide at least three of those.

import { useEffect, useState } from 'react';
import { api, type Accuracy, type Dashboard } from '../lib/api';
import { navigate } from '../lib/router';
import { Chip, EmptyState, Panel, PageHeader, Skeleton, StatTile } from '../components/ui/Panel';
import LineChart from '../components/charts/LineChart';
import BarChart from '../components/charts/BarChart';
import DonutChart from '../components/charts/DonutChart';
import Heatmap from '../components/charts/Heatmap';
import Sparkline from '../components/charts/Sparkline';
import { AQI_BAD, AQI_GOOD, aqiBand, aqiColor, dayHour, hhmm, pmBand } from '../components/charts/primitives';
import { BandLegend, BandMark } from '../components/ui/Band';

const RANGES = [
  { days: 1, label: 'сутки' },
  { days: 3, label: '3 дня' },
  { days: 7, label: 'неделя' },
];

const STATUS_LABEL: Record<string, string> = {
  good: 'Чисто',
  moderate: 'Умеренно',
  bad: 'Плохо',
};

const STATUS_COLOR: Record<string, string> = {
  good: 'var(--good)',
  moderate: 'var(--mid)',
  bad: 'var(--bad)',
};

/**
 * Agreement with the outside world.
 *
 * The panel leads with what it is comparing against, because the same MAE
 * means very different things depending on whether the other side is a
 * reference-grade station or another model. When only the model is available
 * it says so rather than quietly implying validation.
 */
function AccuracyPanel({ days }: { days: number }) {
  const [data, setData] = useState<Accuracy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    void api
      .accuracy(Math.max(days, 7))
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  if (failed) return null;
  if (!data) {
    return (
      <Panel title="Сверка с внешними данными">
        <Skeleton lines={3} />
      </Panel>
    );
  }

  const truth = data.is_ground_truth;
  const sourceLabel = truth
    ? `эталонные станции (${data.reference_source})`
    : `модель ${data.reference_source ?? 'Open-Meteo'} — не эталон`;

  return (
    <Panel
      title="Сверка с внешними данными"
      sub={
        <>
          Каждые 30 минут мы складываем в базу внешние показания PM2.5 рядом со своими и сравниваем
          их час к часу. Архив растёт — и вместе с ним точность пересчёта нашего композита в
          привычный PM2.5.
        </>
      }
      action={<Chip color={truth ? 'var(--good)' : 'var(--mid)'}>{truth ? 'эталон' : 'модель'}</Chip>}
    >
      <p
        className="text-sm leading-relaxed rounded-xl px-3.5 py-2.5 mb-4 border border-line bg-fill"
        style={{ borderLeft: `3px solid ${truth ? 'var(--good)' : 'var(--mid)'}` }}
      >
        Сравнение с: <b>{sourceLabel}</b>.{' '}
        {truth
          ? 'Это независимое измерение, так что расхождение ниже — настоящая проверка точности.'
          : 'Ключ OPENAQ_KEY не задан, поэтому сверка идёт с той же моделью, что даёт фон. Это проверка согласованности, а не точности.'}{' '}
        В архиве {data.archive_rows} записей
        {data.archive_since && `, с ${new Date(data.archive_since).toLocaleDateString('ru-RU')}`}.
      </p>

      {data.paired_hours === 0 ? (
        <EmptyState>
          Пока нет ни одного часа, где есть и наши данные, и внешние. Первые точки появятся в течение
          часа после запуска.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatTile label="Средняя ошибка" value={data.metrics.mae ?? '—'} unit="µg/m³" />
            <StatTile
              label="Смещение"
              value={
                data.metrics.bias == null
                  ? '—'
                  : `${data.metrics.bias > 0 ? '+' : ''}${data.metrics.bias}`
              }
              unit="µg/m³"
              // Signed on purpose: a network that reads consistently low is a
              // different problem from one that is merely noisy.
              hint={
                data.metrics.bias == null
                  ? undefined
                  : data.metrics.bias > 0
                    ? 'мы систематически выше'
                    : 'мы систематически ниже'
              }
            />
            <StatTile
              label="Корреляция"
              value={data.metrics.correlation ?? '—'}
              hint="совпадение формы кривой"
            />
            <StatTile
              label="В пределах ±5"
              value={data.metrics.within_5 ?? '—'}
              unit="%"
              hint={`часов сверено: ${data.paired_hours}`}
            />
          </div>

          <LineChart
            labels={data.series.map((p) => dayHour(`${p.hour}:00.000Z`))}
            height={240}
            unit=" µg/m³"
            series={[
              {
                key: 'ours',
                label: 'Наша сеть',
                color: 'var(--status-c)',
                values: data.series.map((p) => p.ours),
              },
              {
                key: 'ref',
                label: truth ? 'Эталон' : 'Модель',
                color: 'rgba(154,164,176,0.9)',
                values: data.series.map((p) => p.reference),
                dashed: true,
              },
            ]}
          />
        </>
      )}
    </Panel>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState(3);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    void api
      .dashboard(days)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  if (error) return <EmptyState>Не удалось загрузить статистику.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Дэшборд · статистика"
        title="Город в цифрах"
        sub="Агрегаты по всей сети: динамика, суточный ритм, разброс между районами и состояние оборудования."
      />

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)}>
            {r.label}
          </Chip>
        ))}
      </div>

      {!data ? (
        <Skeleton lines={8} className="liquid-glass rounded-2xl p-5" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Индекс города"
              value={data.kpi.city_aqi ?? '—'}
              color={data.kpi.city_aqi != null ? aqiColor(data.kpi.city_aqi) : undefined}
              trend={data.kpi.change_24h_pct}
              hint={data.kpi.city_pm25 != null ? `PM2.5 ≈ ${data.kpi.city_pm25} µg/m³` : undefined}
            />
            <StatTile
              label="Станции на связи"
              value={`${data.kpi.stations_online}/${data.kpi.stations_total}`}
              hint={`средний аптайм ${data.kpi.avg_uptime}%`}
            />
            <StatTile
              label="Чище всего"
              value={data.kpi.best_district ?? '—'}
              color="var(--good)"
              hint="по текущей оценке"
            />
            <StatTile
              label="Хуже всего"
              value={data.kpi.worst_district ?? '—'}
              color="var(--bad)"
              hint={`аномалий за период: ${data.kpi.anomalies_window}`}
            />
          </div>

          <Panel
            title="Динамика по городу"
            sub="Среднее по всем станциям, почасово. Полоса — разброс между самой чистой и самой грязной станцией в этот час."
          >
            {data.city_series.length > 1 ? (
              <LineChart
                labels={data.city_series.map((p) => (days > 1 ? dayHour(p.ts) : hhmm(p.ts)))}
                height={280}
                yMin={0}
                series={[
                  {
                    key: 'city',
                    label: 'Среднее по городу',
                    color: 'var(--status-c)',
                    values: data.city_series.map((p) => p.aqi),
                    fill: true,
                  },
                ]}
                band={{
                  lower: data.city_series.map((p) => p.min),
                  upper: data.city_series.map((p) => p.max),
                  color: 'var(--status-c)',
                }}
                guides={[
                  { value: AQI_GOOD, label: 'умеренный', color: 'var(--mid)' },
                  { value: AQI_BAD, label: 'вредный', color: 'var(--bad)' },
                ]}
              />
            ) : (
              <EmptyState>Пока мало истории для графика.</EmptyState>
            )}
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel
              title="Сколько времени чем дышим"
              sub="Доля часов за период в каждой категории."
            >
              <DonutChart
                slices={data.status_split.map((s) => ({
                  label: STATUS_LABEL[s.status] ?? s.status,
                  value: s.hours,
                  color: STATUS_COLOR[s.status] ?? 'var(--muted)',
                }))}
                centerValue={`${data.status_split.find((s) => s.status === 'good')?.share ?? 0}%`}
                centerLabel="чистых часов"
              />
            </Panel>

            <Panel title="Ритм недели" sub="Средний индекс по дням недели за период.">
              <BarChart
                height={230}
                bars={data.weekday_profile.map((d) => ({
                  label: d.day,
                  value: d.aqi,
                  color: d.aqi == null ? 'var(--muted)' : aqiColor(d.aqi),
                  sub: d.samples ? `${d.samples} ч` : undefined,
                }))}
              />
            </Panel>
          </div>

          <Panel
            title="Суточный ритм по станциям"
            sub="Средний AQI в каждый час местного времени. Тёмные полосы утром и вечером — час пик, ночные — застой воздуха."
          >
            <Heatmap
              rows={data.hourly_profile.map((r) => ({ label: r.station, values: r.values }))}
              colorFor={aqiColor}
              bandFor={aqiBand}
            />
            <div className="mt-4">
              <BandLegend metric="aqi" />
            </div>
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Температура и влажность по городу" sub="Среднее по DHT22 всех станций.">
              {data.climate_series.length > 1 ? (
                <LineChart
                  labels={data.climate_series.map((p) => (days > 1 ? dayHour(p.ts) : hhmm(p.ts)))}
                  height={230}
                  series={[
                    {
                      key: 'temp',
                      label: 'Температура, °C',
                      color: '#fb923c',
                      values: data.climate_series.map((p) => p.temp_c),
                    },
                    {
                      key: 'hum',
                      label: 'Влажность, %',
                      color: '#a78bfa',
                      values: data.climate_series.map((p) => p.humidity),
                    },
                  ]}
                />
              ) : (
                <EmptyState>Нет климатических данных за период.</EmptyState>
              )}
            </Panel>

            <Panel title="Средний индекс по станциям" sub="За выбранный период.">
              <BarChart
                horizontal
                bars={data.per_station.map((s) => ({
                  label: s.name,
                  value: s.avg_aqi,
                  color: s.avg_aqi == null ? 'var(--muted)' : aqiColor(s.avg_aqi),
                }))}
              />
            </Panel>
          </div>

          <AccuracyPanel days={days} />

          <Panel title="Станции" sub="Нажмите на строку, чтобы открыть станцию целиком.">
            {/* Was `min-w-[Npx]` inside `overflow-x-auto`: on a phone the table was
                  wider than the screen, scrolled sideways, and gave no sign
                  that it did. Secondary columns now drop out below their
                  breakpoint instead, so the table fits; `scroll-x` paints an
                  edge shadow for the cases where it still overflows, and
                  `scope`/`caption` give the remaining grid a structure a screen
                  reader can navigate. */}
            <div className="scroll-x -mx-1 px-1">
              <table className="w-full text-sm">
                <caption className="sr-only">Станции сети: текущий и средний индекс, аптайм</caption>
                <thead>
                  <tr className="text-muted text-left">
                    <th scope="col" className="font-normal py-2">Станция</th>
                    <th scope="col" className="font-normal py-2 text-right">сейчас</th>
                    <th scope="col" className="font-normal py-2 text-right hidden sm:table-cell">среднее</th>
                    <th scope="col" className="font-normal py-2 text-right hidden lg:table-cell">мин / макс</th>
                    <th scope="col" className="font-normal py-2 text-right">аптайм</th>
                    <th scope="col" className="font-normal py-2 text-right hidden md:table-cell">тренд</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_station.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/stations/${encodeURIComponent(s.id)}`)}
                      className="border-t border-line-soft cursor-pointer hover:bg-fill-hover transition-colors"
                    >
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          {s.current_aqi == null ? (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-muted shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <BandMark band={aqiBand(s.current_aqi)} />
                          )}
                          <span>
                            {s.name}
                            <span className="block text-xs text-muted">
                              {s.district ?? '—'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{s.current_aqi ?? '—'}</td>
                      <td className="py-2.5 text-right tabular-nums hidden sm:table-cell">{s.avg_aqi ?? '—'}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted hidden lg:table-cell">
                        {s.min_aqi ?? '—'} / {s.max_aqi ?? '—'}
                      </td>
                      <td
                        className="py-2.5 text-right tabular-nums"
                        style={{ color: s.uptime > 0.9 ? 'var(--good)' : s.uptime > 0.6 ? 'var(--mid)' : 'var(--bad)' }}
                      >
                        {Math.round(s.uptime * 100)}%
                      </td>
                      <td className="py-2.5 text-right hidden md:table-cell">
                        <span className="inline-block align-middle">
                          <Sparkline
                            values={s.sparkline}
                            color={s.avg_aqi == null ? 'var(--muted)' : aqiColor(s.avg_aqi)}
                            width={90}
                            height={26}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Районы"
            sub="Отсортировано по сводному индексу — он берёт худшее из локального AQI-композита и внешнего PM2.5, поэтому порядок строк не всегда совпадает с колонкой PM2.5. Район без своей станции оценивается интерполяцией: уверенность ниже."
          >
            <div className="scroll-x -mx-1 px-1">
              <table className="w-full text-sm">
                <caption className="sr-only">Районы: сводный индекс, PM2.5, уверенность оценки</caption>
                <thead>
                  <tr className="text-muted text-left">
                    <th scope="col" className="font-normal py-2">#</th>
                    <th scope="col" className="font-normal py-2">Район</th>
                    <th scope="col" className="font-normal py-2 text-right">Индекс</th>
                    <th scope="col" className="font-normal py-2 text-right hidden sm:table-cell">PM2.5</th>
                    <th scope="col" className="font-normal py-2 text-right hidden lg:table-cell">AQI</th>
                    <th scope="col" className="font-normal py-2 text-right hidden md:table-cell">Уверенность</th>
                    <th scope="col" className="font-normal py-2 text-right">Своя станция</th>
                  </tr>
                </thead>
                <tbody>
                  {data.districts.map((d, i) => (
                    <tr key={d.district} className="border-t border-line-soft">
                      <td className="py-2 tabular-nums text-muted">{i + 1}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          {/* `score` is on the AQI-composite scale, so it is
                              banded as AQI. The old code divided it by three to
                              force it through the PM2.5 ramp, which happened to
                              land in roughly the right colour and would have
                              silently broken the moment either threshold moved. */}
                          <BandMark band={d.pm2_5 != null ? pmBand(d.pm2_5) : aqiBand(d.score)} />
                          {d.district}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{d.score}</td>
                      <td className="py-2 text-right tabular-nums hidden sm:table-cell">{d.pm2_5 ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums hidden lg:table-cell">{d.aqi_composite}</td>
                      <td className="py-2 text-right tabular-nums text-muted hidden md:table-cell">
                        {Math.round(d.confidence * 100)}%
                      </td>
                      <td className="py-2 text-right">
                        {d.has_own_station ? (
                          <span style={{ color: 'var(--good)' }}>есть</span>
                        ) : (
                          <span className="text-muted">нет</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {data.anomalies.length > 0 && (
            <Panel title="Последние аномалии" sub="Выбросы по z-score, сгруппированные в события.">
              <ul className="grid sm:grid-cols-2 gap-2.5">
                {data.anomalies.map((a, i) => (
                  <li
                    key={`${a.device_id}-${a.ts_start}-${i}`}
                    className="rounded-xl border border-line bg-fill px-3.5 py-2.5 text-sm"
                    style={{ borderLeft: `3px solid ${a.severity > 3 ? 'var(--bad)' : 'var(--mid)'}` }}
                  >
                    <span className="text-gray-200">{a.device_id}</span> · {a.metric}
                    <span className="block text-muted">
                      {dayHour(a.ts_start)} — пик {Math.round(a.peak_value)}, сила{' '}
                      {Math.round(a.severity * 10) / 10}σ
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <p className="text-xs text-muted px-1">
            Обновлено {new Date(data.generated_at).toLocaleString('ru-RU')} · окно {data.window_days} дн.
          </p>
        </>
      )}
    </div>
  );
}
