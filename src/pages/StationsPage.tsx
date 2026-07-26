// "Станции" — the fleet, and everything one box is reporting.
//
// The detail view is where the DHT22 stops being an internal compensation
// input and becomes data in its own right: temperature, humidity, dew point,
// absolute humidity and a comfort read, charted next to the gas channels so a
// spike can be checked against the conditions that produced it.

import { useEffect, useState } from 'react';
import {
  api,
  type GasChannel,
  type Station,
  type StationDetail,
  type StationSeriesPoint,
} from '../lib/api';
import { useRoute, navigate } from '../lib/router';
import { Chip, EmptyState, Panel, PageHeader, Skeleton, StatTile } from '../components/ui/Panel';
import LineChart from '../components/charts/LineChart';
import BarChart from '../components/charts/BarChart';
import Gauge from '../components/charts/Gauge';
import Sparkline from '../components/charts/Sparkline';
import { AQI_BAD, AQI_GOOD, aqiColor, dayHour, hhmm, pmColorVar } from '../components/charts/primitives';

const WINDOWS = [
  { hours: 6, label: '6 ч' },
  { hours: 24, label: '24 ч' },
  { hours: 72, label: '3 дня' },
  { hours: 168, label: 'неделя' },
];

// Every gas element the fleet can carry, in one table so the chart, the
// breakdown bars and the labels can never drift apart.
const GAS_CHANNELS = [
  { key: 'mq2', seriesKey: 'mq2_ppm', label: 'MQ2 · дым', color: '#f87171' },
  { key: 'mq4', seriesKey: 'mq4_ppm', label: 'MQ4 · метан', color: '#fbbf24' },
  { key: 'mq8', seriesKey: 'mq8_ppm', label: 'MQ8 · водород', color: '#4ade80' },
  { key: 'mq135', seriesKey: 'mq135_ppm', label: 'MQ-135 · смесь горения', color: '#38bdf8' },
] as const satisfies ReadonlyArray<{
  key: GasChannel;
  seriesKey: keyof StationSeriesPoint;
  label: string;
  color: string;
}>;

const channelLabel = (key: GasChannel): string =>
  GAS_CHANNELS.find((c) => c.key === key)?.label.split(' · ')[0] ?? key.toUpperCase();

const HEALTH_COLOR: Record<string, string> = {
  healthy: 'var(--good)',
  watch: 'var(--mid)',
  suspect: 'var(--bad)',
  offline: 'var(--muted)',
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: 'исправна',
  watch: 'под наблюдением',
  suspect: 'под вопросом',
  offline: 'нет связи',
};

export default function StationsPage() {
  const { segments } = useRoute();
  const id = segments[1] ? decodeURIComponent(segments[1]) : null;
  return id ? <StationDetailView id={id} /> : <StationList />;
}

function StationList() {
  const [stations, setStations] = useState<Station[] | null>(null);

  useEffect(() => {
    void api.stations().then(setStations).catch(() => setStations([]));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Сеть · станции"
        title="Наши посты наблюдения"
        sub="Станция, которую мы собираем, — ESP8266 с MQ-135: он реагирует на смесь продуктов горения, из которой и состоит зимний воздух Алматы. DHT22 ставится на часть постов и даёт поправку по температуре и влажности из самой точки замера. Остальные посты в списке — демонстрационные: их данные генерирует модель, и это подписано на каждой карточке."
      />

      {stations == null ? (
        <Skeleton lines={6} className="liquid-glass rounded-2xl p-5" />
      ) : stations.length === 0 ? (
        <EmptyState>Станции не найдены.</EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stations.map((s) => {
            const pm = s.reading?.pm25_equivalent ?? null;
            const color = pm != null ? pmColorVar(pm) : 'var(--muted)';
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/stations/${encodeURIComponent(s.id)}`)}
                className="liquid-glass rounded-2xl p-4 text-left hover:bg-fill-hover transition-colors"
                style={{ borderTop: `2px solid ${color}` }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-md truncate flex items-center gap-1.5">
                      {s.name}
                      {s.led !== 'off' && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          title={`Светодиод станции: ${s.led === 'green' ? 'зелёный' : 'красный'}`}
                          style={{
                            background: s.led === 'green' ? 'var(--good)' : 'var(--bad)',
                            boxShadow: `0 0 6px ${s.led === 'green' ? 'var(--good)' : 'var(--bad)'}`,
                          }}
                        />
                      )}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {s.district ?? '—'} · {s.sensor_kind === 'mq135' ? 'MQ-135' : 'MQ2/MQ4/MQ8'}
                      {s.climate ? ' + DHT22' : ''}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-2xs px-2 py-1 rounded-full"
                    style={{
                      color: s.online ? 'var(--good)' : 'var(--muted)',
                      background: s.online ? 'var(--good-dim)' : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    {s.online ? 'на связи' : 'нет связи'}
                  </span>
                </div>

                <div className="flex items-end gap-4 mb-2.5">
                  <div>
                    <p className="text-3xl leading-none tabular-nums" style={{ color }}>
                      {s.reading ? s.reading.aqi_composite : '—'}
                    </p>
                    <p className="text-2xs text-muted mt-1">AQI-композит</p>
                  </div>
                  {s.climate && (
                    <div className="text-sm text-gray-300 leading-tight">
                      <p>{s.climate.temp_c} °C</p>
                      <p className="text-muted">{s.climate.humidity}% влажн.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span
                    style={{ color: s.is_demo ? 'var(--mid)' : 'var(--good)' }}
                    title={s.is_demo ? 'Данные генерирует модель' : 'Физическая станция'}
                  >
                    {s.is_demo ? 'демо' : 'реальное железо'}
                  </span>
                  <span>{s.samples_24h} замеров/сут</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StationDetailView({ id }: { id: string }) {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<StationDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    void api
      .station(id, hours)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [id, hours]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <EmptyState>Станция не найдена.</EmptyState>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Skeleton lines={8} className="liquid-glass rounded-2xl p-5" />
      </div>
    );
  }

  const { station, reading, climate, health, series, stats } = data;
  // Two different absences: no DHT22 fitted at all, versus one fitted but
  // silent. They call for different copy and are trivial to confuse.
  const hasDht22 = station.hardware.climate_sensor != null;
  const hasTrio = station.sensor_kind === 'mq_trio';
  // A week of points at a ~1h step is too dense for six x labels to be useful;
  // switch the format instead of thinning the data.
  const labelFor = hours > 24 ? dayHour : hhmm;
  const labels = series.map((p) => labelFor(p.ts));

  return (
    <div className="flex flex-col gap-4">
      <BackLink />

      <PageHeader
        eyebrow={`Станция · ${station.district ?? 'Алматы'}`}
        title={station.name}
        sub={
          [
            station.hardware.board,
            station.hardware.gas_sensors.join(' / '),
            // Omitted entirely rather than printed as "null" — this build
            // simply has no climate sensor on it.
            station.hardware.climate_sensor,
          ]
            .filter(Boolean)
            .join(' · ') + `. Прошивка ${station.firmware ?? '—'}.`
        }
      >
        <div className="flex flex-wrap gap-2 mt-3">
          <Chip color={station.online ? 'var(--good)' : 'var(--bad)'}>
            {station.online ? 'на связи' : 'нет связи'}
            {station.minutes_ago != null && ` · ${station.minutes_ago} мин назад`}
          </Chip>
          <DemoChip isDemo={station.is_demo} />
          {station.hardware.has_led_indicator && station.led !== 'off' && (
            <Chip
              color={station.led === 'green' ? 'var(--good)' : 'var(--bad)'}
              title="Логика индикации зашита в прошивку: станция отвечает без телефона и интернета"
            >
              Светодиод: {station.led === 'green' ? 'зелёный · можно гулять' : 'красный · лучше дома'}
            </Chip>
          )}
          {health && (
            <Chip color={HEALTH_COLOR[health.status]}>
              {HEALTH_LABEL[health.status]} · {health.score}/100
            </Chip>
          )}
          {hasTrio && data.event && data.event.confidence > 0.4 && (
            <Chip color="var(--mid)">
              Похоже на: {data.event.label} ({Math.round(data.event.confidence * 100)}%)
            </Chip>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="AQI-композит"
          value={reading?.aqi_composite ?? '—'}
          color={reading ? aqiColor(reading.aqi_composite) : undefined}
          hint={reading ? `PM2.5-эквивалент ${reading.pm25_equivalent}` : undefined}
        />
        <StatTile
          label="Температура"
          value={climate ? climate.temp_c : '—'}
          unit="°C"
          hint={
            climate
              ? `ощущается ${climate.feels_like_c} °C`
              : hasDht22
                ? 'DHT22 не отвечает'
                : 'DHT22 не установлен'
          }
        />
        <StatTile
          label="Влажность"
          value={climate ? climate.humidity : '—'}
          unit="%"
          hint={climate ? `точка росы ${climate.dew_point_c} °C` : undefined}
        />
        <StatTile
          label="Замеров за окно"
          value={stats.samples}
          hint={`${stats.samples_good} чистых · ${stats.samples_bad} плохих`}
        />
      </div>

      {/* DHT22 */}
      <Panel
        title={hasDht22 ? 'Климат станции · DHT22' : 'Климат станции'}
        sub={
          hasDht22
            ? 'Датчик участвует в компенсации газовых кривых и одновременно показывает микроклимат точки.'
            : 'DHT22 — надстройка над базовой сборкой, он стоит не на всех постах.'
        }
      >
        {climate ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-4">
              <Metric label="Температура" value={`${climate.temp_c} °C`} />
              <Metric label="Ощущается" value={`${climate.feels_like_c} °C`} />
              <Metric label="Влажность" value={`${climate.humidity} %`} />
              <Metric
                label="Точка росы"
                value={`${climate.dew_point_c} °C`}
                hint="ниже неё воздух начнёт конденсироваться"
              />
              <Metric
                label="Абсолютная влажность"
                value={`${climate.absolute_humidity} г/м³`}
                hint="реальное содержание воды"
              />
            </div>
            <p
              className="text-sm leading-relaxed rounded-xl px-3.5 py-3 border border-line bg-fill"
              style={{ borderLeft: '3px solid var(--status-c)' }}
            >
              <b>{climate.comfort}</b> — {climate.comfort_note}
            </p>
          </>
        ) : (
          <EmptyState>
            {hasDht22
              ? 'DHT22 не прислал ни температуры, ни влажности за последние замеры.'
              : 'На этой станции DHT22 не установлен: поправка по температуре и влажности берётся из городской модели, поэтому замеры помечаются флагом no_compensation.'}
          </EmptyState>
        )}
      </Panel>

      {/* Window selector + charts */}
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <Chip key={w.hours} active={hours === w.hours} onClick={() => setHours(w.hours)}>
            {w.label}
          </Chip>
        ))}
      </div>

      <Panel title="AQI станции" sub={`За последние ${hours} ч. Пороговые линии — умеренный и вредный уровень.`}>
        {series.length > 1 ? (
          <LineChart
            labels={labels}
            height={250}
            yMin={0}
            series={[
              {
                key: 'aqi',
                label: 'AQI',
                color: 'var(--status-c)',
                values: series.map((p) => p.aqi),
                fill: true,
              },
            ]}
            guides={[
              { value: AQI_GOOD, label: 'умеренный', color: 'var(--mid)' },
              { value: AQI_BAD, label: 'вредный', color: 'var(--bad)' },
            ]}
          />
        ) : (
          <EmptyState>Мало точек для графика.</EmptyState>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Температура и влажность" sub="Данные DHT22 за то же окно.">
          {series.some((p) => p.temp_c != null) ? (
            <LineChart
              labels={labels}
              height={230}
              unit=""
              series={[
                {
                  key: 'temp',
                  label: 'Температура, °C',
                  color: '#fb923c',
                  values: series.map((p) => p.temp_c),
                },
                {
                  key: 'dew',
                  label: 'Точка росы, °C',
                  color: '#38bdf8',
                  values: series.map((p) => p.dew_point_c),
                  dashed: true,
                },
                {
                  key: 'hum',
                  label: 'Влажность, %',
                  color: '#a78bfa',
                  values: series.map((p) => p.humidity),
                },
              ]}
            />
          ) : (
            <EmptyState>Нет климатических данных за это окно.</EmptyState>
          )}
        </Panel>

        <Panel title="Газовые каналы" sub="Приведённые концентрации после калибровки и компенсации.">
          {/* Only chart the channels this station actually carries — an MQ-135
              post would otherwise show three flat empty lines. */}
          <LineChart
            labels={labels}
            height={230}
            unit=" ppm"
            series={GAS_CHANNELS.filter((c) =>
              series.some((p) => p[c.seriesKey] != null),
            ).map((c) => ({
              key: c.key,
              label: c.label,
              color: c.color,
              values: series.map((p) => p[c.seriesKey]),
            }))}
          />
          {reading?.breakdown && (
            <div className="mt-4">
              <p className="text-sm text-muted mb-2">
                Вклад в композит сейчас
                {reading.breakdown.dominant
                  ? ` (итог — максимум, ведущий канал: ${channelLabel(reading.breakdown.dominant)})`
                  : ''}
              </p>
              <BarChart
                horizontal
                bars={GAS_CHANNELS.filter((c) => reading.breakdown!.parts[c.key] != null).map((c) => ({
                  label: channelLabel(c.key),
                  value: reading.breakdown!.parts[c.key] ?? null,
                  color: c.key === reading.breakdown!.dominant ? 'var(--status-c)' : 'rgba(154,164,176,0.55)',
                }))}
              />
            </div>
          )}
        </Panel>
      </div>

      {/* Health + hardware */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Здоровье сенсора" sub="Ниже 60 баллов станция исключается из интерполяции.">
          {health ? (
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <Gauge
                value={health.score}
                max={100}
                color={HEALTH_COLOR[health.status] ?? 'var(--muted)'}
                label={HEALTH_LABEL[health.status] ?? health.status}
                size={170}
              />
              <div className="flex-1 w-full">
                <BarChart
                  horizontal
                  unit="%"
                  bars={[
                    { label: 'Непрерывность', value: health.factors.uptime * 100, color: 'var(--good)' },
                    { label: 'Качество данных', value: health.factors.data_quality * 100, color: 'var(--good)' },
                    { label: 'Согласие с соседями', value: health.factors.agreement * 100, color: 'var(--mid)' },
                    { label: 'Стабильность базы', value: health.factors.drift * 100, color: 'var(--mid)' },
                  ]}
                />
                <p className="text-xs text-muted mt-2.5">
                  Данные есть за {health.hours_with_data} из {health.hours_expected} часов ·{' '}
                  {health.packets_24h} пакетов за сутки
                  {health.neighbor_deviation_aqi != null &&
                    ` · отклонение от соседей ${health.neighbor_deviation_aqi} AQI`}
                </p>
                {health.hints.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {health.hints.map((h) => (
                      <li key={h} className="text-xs text-[color:var(--mid)] leading-relaxed">
                        · {h}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <EmptyState>Нет данных о состоянии сенсора.</EmptyState>
          )}
        </Panel>

        <Panel title="Железо и калибровка">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <Fact label="Плата" value={station.hardware.board} />
            <Fact label="Газовые сенсоры" value={station.hardware.gas_sensors.join(' / ')} />
            <Fact
              label="Климат"
              value={station.hardware.climate_sensor ?? 'не установлен'}
            />
            <Fact label="Индикация" value={station.hardware.has_led_indicator ? 'светодиод' : 'нет'} />
            <Fact label="Питание" value={`${station.hardware.vcc_mv} мВ`} />
            <Fact label="Нагрузочный резистор" value={`${station.hardware.rl_ohm} Ом`} />
            {/* R0 is per element, and the set of elements differs per build. */}
            {GAS_CHANNELS.filter((c) => station.hardware.r0[c.key] != null).map((c) => (
              <Fact
                key={c.key}
                label={`R0 ${channelLabel(c.key)}`}
                value={`${Math.round(station.hardware.r0[c.key]!)} Ом`}
              />
            ))}
            <Fact
              label="Установлена"
              value={new Date(station.installed_at).toLocaleDateString('ru-RU')}
            />
          </dl>

          {data.raw_adc && (
            <>
              <p className="text-sm text-muted mt-4 mb-2">
                Сырые значения АЦП последнего пакета (0–1023)
              </p>
              <BarChart
                height={170}
                bars={GAS_CHANNELS.filter((c) => data.raw_adc![`${c.key}_adc`] != null).map((c) => ({
                  label: channelLabel(c.key),
                  value: data.raw_adc![`${c.key}_adc`],
                  color: c.color,
                }))}
              />
            </>
          )}
        </Panel>
      </div>

      {/* Stats + anomalies */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={`Сводка за ${hours} ч`}>
          <div className="scroll-x -mx-1 px-1">
            <table className="w-full text-sm">
              <caption className="sr-only">Сводка по метрикам станции за выбранный период</caption>
              <thead>
                <tr className="text-muted text-left">
                  <th scope="col" className="font-normal py-2">Метрика</th>
                  <th scope="col" className="font-normal py-2 text-right">мин</th>
                  <th scope="col" className="font-normal py-2 text-right">сред</th>
                  <th scope="col" className="font-normal py-2 text-right hidden sm:table-cell">медиана</th>
                  <th scope="col" className="font-normal py-2 text-right">макс</th>
                  <th scope="col" className="font-normal py-2 text-right hidden md:table-cell">тренд</th>
                </tr>
              </thead>
              <tbody>
                <StatRow
                  label="AQI"
                  agg={stats.aqi}
                  spark={series.map((p) => p.aqi)}
                  color="var(--status-c)"
                />
                <StatRow
                  label="Температура, °C"
                  agg={stats.temp_c}
                  spark={series.map((p) => p.temp_c).filter((v): v is number => v != null)}
                  color="#fb923c"
                />
                <StatRow
                  label="Влажность, %"
                  agg={stats.humidity}
                  spark={series.map((p) => p.humidity).filter((v): v is number => v != null)}
                  color="#a78bfa"
                />
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="События за сутки" sub="Скользящий z-score по каналам, сгруппированный в события.">
          {data.anomalies.length === 0 ? (
            <EmptyState>Аномалий не зафиксировано.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.anomalies.map((a, i) => (
                <li
                  key={`${a.ts_start}-${i}`}
                  className="rounded-xl border border-line bg-fill px-3.5 py-2.5 text-sm"
                  style={{ borderLeft: `3px solid ${a.severity > 3 ? 'var(--bad)' : 'var(--mid)'}` }}
                >
                  <span className="text-gray-200">{a.metric}</span> ·{' '}
                  <span className="text-muted">
                    {hhmm(a.ts_start)}–{hhmm(a.ts_end)}, пик {Math.round(a.peak_value)}, сила{' '}
                    {Math.round(a.severity * 10) / 10}σ
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/**
 * The one label that must never be missing. Half the fleet is generated by the
 * mock pipeline, and a screen full of charts makes generated numbers look
 * exactly like measured ones unless it says otherwise.
 */
function DemoChip({ isDemo }: { isDemo: boolean }) {
  return isDemo ? (
    <Chip color="var(--mid)" title="Данные генерируются моделью, а не измеряются">
      демо-станция
    </Chip>
  ) : (
    <Chip color="var(--good)" title="Физическая станция, данные приходят с железа">
      реальное железо
    </Chip>
  );
}

function BackLink() {
  return (
    <button
      type="button"
      onClick={() => navigate('/stations')}
      className="self-start text-sm text-gray-300 hover:text-white transition-colors"
    >
      ← Все станции
    </button>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-fill px-3.5 py-3">
      <p className="text-2xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="text-xl leading-tight mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-2xs text-muted mt-1 leading-snug">{hint}</p>}
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

function StatRow({
  label,
  agg,
  spark,
  color,
}: {
  label: string;
  agg: { min: number; max: number; avg: number; median: number } | null;
  spark: number[];
  color: string;
}) {
  return (
    <tr className="border-t border-line-soft">
      <td className="py-2">{label}</td>
      <td className="py-2 text-right tabular-nums">{agg?.min ?? '—'}</td>
      <td className="py-2 text-right tabular-nums">{agg?.avg ?? '—'}</td>
      <td className="py-2 text-right tabular-nums hidden sm:table-cell">{agg?.median ?? '—'}</td>
      <td className="py-2 text-right tabular-nums">{agg?.max ?? '—'}</td>
      <td className="py-2 text-right hidden md:table-cell">
        <span className="inline-block align-middle">
          <Sparkline values={spark} color={color} width={90} height={26} />
        </span>
      </td>
    </tr>
  );
}
