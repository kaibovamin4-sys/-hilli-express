// Feature engineering for the 6-hour AQI forecast.
//
// One row = "what we knew at hour t, for a station", one target = "the AQI
// that station actually recorded at hour t+h". Training a separate model per
// horizon h (direct multi-step) rather than feeding a prediction back into
// itself avoids compounding our own error over six steps.
//
// Three families of inputs:
//   · local dynamics  — lags, rolling mean/σ and deltas of our own composite,
//                       plus the raw gas channels and the DHT22 pair
//   · known future    — Open-Meteo's own hourly forecast *for the target hour*:
//                       wind, temperature, pressure, precipitation, PM2.5
//   · calendar        — hour and weekday as sine/cosine pairs so that 23:00
//                       and 00:00 sit next to each other
//
// The "known future" block is what makes this more than trend extrapolation:
// the model gets to see that wind picks up in three hours and learns, from
// history, how much our valley actually clears when it does.

import type { HourlySeries } from '../external/openMeteo.js';
import type { HourlyAggregate } from '../db/repositories.js';

export const FEATURE_NAMES = [
  'aqi_lag0',
  'aqi_lag1',
  'aqi_lag2',
  'aqi_lag3',
  'aqi_lag6',
  'aqi_mean3',
  'aqi_mean6',
  'aqi_delta1',
  'aqi_delta3',
  'aqi_std6',
  'mq2_ppm',
  'mq4_ppm',
  'mq8_ppm',
  'mq135_ppm',
  'dht22_temp_c',
  'dht22_humidity',
  'ext_pm25_now',
  'ext_pm25_target',
  'ext_pm25_delta',
  'ext_pm10_target',
  'ext_no2_target',
  'wind_target',
  'wind_change',
  'wind_dir_sin',
  'wind_dir_cos',
  'temp_target',
  'temp_change',
  'humidity_target',
  'pressure_target',
  'precip_target',
  'cloud_target',
  'inversion_index',
  'hour_sin',
  'hour_cos',
  'dow_sin',
  'dow_cos',
  'is_rush_hour',
  'is_weekend',
] as const;

// Human-readable labels for the feature-importance chart on the forecast page.
export const FEATURE_LABELS: Record<string, string> = {
  aqi_lag0: 'Текущий AQI станции',
  aqi_lag1: 'AQI час назад',
  aqi_lag2: 'AQI 2 часа назад',
  aqi_lag3: 'AQI 3 часа назад',
  aqi_lag6: 'AQI 6 часов назад',
  aqi_mean3: 'Среднее за 3 часа',
  aqi_mean6: 'Среднее за 6 часов',
  aqi_delta1: 'Изменение за час',
  aqi_delta3: 'Изменение за 3 часа',
  aqi_std6: 'Разброс за 6 часов',
  mq2_ppm: 'MQ2 (дым, ppm)',
  mq4_ppm: 'MQ4 (метан, ppm)',
  mq8_ppm: 'MQ8 (водород, ppm)',
  mq135_ppm: 'MQ-135 (смесь горения, ppm)',
  dht22_temp_c: 'DHT22: температура',
  dht22_humidity: 'DHT22: влажность',
  ext_pm25_now: 'PM2.5 сейчас (модель)',
  ext_pm25_target: 'PM2.5 на час прогноза',
  ext_pm25_delta: 'Δ PM2.5 к часу прогноза',
  ext_pm10_target: 'PM10 на час прогноза',
  ext_no2_target: 'NO₂ на час прогноза',
  wind_target: 'Ветер на час прогноза',
  wind_change: 'Изменение ветра',
  wind_dir_sin: 'Направление ветра (в-з)',
  wind_dir_cos: 'Направление ветра (с-ю)',
  temp_target: 'Температура на час прогноза',
  temp_change: 'Изменение температуры',
  humidity_target: 'Влажность на час прогноза',
  pressure_target: 'Давление',
  precip_target: 'Осадки',
  cloud_target: 'Облачность',
  inversion_index: 'Индекс инверсии',
  hour_sin: 'Время суток (синус)',
  hour_cos: 'Время суток (косинус)',
  dow_sin: 'День недели (синус)',
  dow_cos: 'День недели (косинус)',
  is_rush_hour: 'Час пик',
  is_weekend: 'Выходной',
};

export const N_FEATURES = FEATURE_NAMES.length;

/** UTC hour key (`YYYY-MM-DDTHH:00`) — the join key across every source. */
export function hourKey(d: Date): string {
  return `${d.toISOString().slice(0, 13)}:00`;
}

export function parseHourKey(key: string): Date {
  return new Date(`${key}:00.000Z`);
}

export function addHours(key: string, h: number): string {
  return hourKey(new Date(parseHourKey(key).getTime() + h * 3_600_000));
}

/**
 * Open-Meteo returns local timestamps when asked for `timezone=auto`, so its
 * labels must be shifted by the reported UTC offset before they can be looked
 * up by our UTC hour keys. Doing it here, once, keeps every caller on one
 * clock.
 */
export function indexSeries(series: HourlySeries): Map<string, Record<string, number | null>> {
  const out = new Map<string, Record<string, number | null>>();
  for (let i = 0; i < series.time.length; i++) {
    const local = new Date(`${series.time[i]!}:00Z`); // labels have no offset
    const utc = new Date(local.getTime() - series.utcOffsetSeconds * 1000);
    const row: Record<string, number | null> = {};
    for (const [field, values] of Object.entries(series.values)) row[field] = values[i] ?? null;
    out.set(hourKey(utc), row);
  }
  return out;
}

export interface ExternalContext {
  air: Map<string, Record<string, number | null>>;
  weather: Map<string, Record<string, number | null>>;
}

const num = (v: number | null | undefined, fallback: number): number =>
  v == null || !Number.isFinite(v) ? fallback : v;

/**
 * Calm + cold + clear + high pressure after dark is the classic Almaty
 * inversion recipe: the cold air pools in the valley, the lid closes and
 * whatever is emitted stays put. Expressed as a smooth 0..1 product so the
 * trees can split on "how strongly" rather than a hard flag.
 */
function inversionIndex(windMs: number, tempC: number, pressureHpa: number, cloud: number, hour: number): number {
  const calm = Math.exp(-windMs / 1.6);
  const night = hour >= 20 || hour <= 8 ? 1 : 0.25;
  const cold = Math.min(1, Math.max(0, (8 - tempC) / 20));
  const high = Math.min(1, Math.max(0, (pressureHpa - 1008) / 22));
  const clear = Math.min(1, Math.max(0, (70 - cloud) / 70));
  return calm * night * (0.4 + 0.6 * cold) * (0.4 + 0.6 * high) * (0.5 + 0.5 * clear);
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

/**
 * Builds one feature vector, or null when the history at `t` is too short to
 * fill the lag window. `targetKey` is the hour being predicted — the external
 * covariates are read at *that* hour, not at t.
 */
export function buildFeatureRow(
  byHour: Map<string, HourlyAggregate>,
  originKey: string,
  targetKey: string,
  ext: ExternalContext,
): number[] | null {
  const lag = (h: number): HourlyAggregate | undefined => byHour.get(addHours(originKey, -h));
  const l0 = lag(0);
  const l1 = lag(1);
  const l2 = lag(2);
  const l3 = lag(3);
  const l6 = lag(6);
  // Requiring l0..l3 (not l6) keeps the first hours of a fresh install usable;
  // the 6-hour lag degrades to the 3-hour one instead of dropping the row.
  if (!l0 || !l1 || !l2 || !l3) return null;

  const window = [l0, l1, l2, l3, lag(4), lag(5), l6]
    .filter((r): r is HourlyAggregate => r !== undefined)
    .map((r) => r.aqi);
  const mean3 = (l0.aqi + l1.aqi + l2.aqi) / 3;
  const mean6 = window.reduce((s, v) => s + v, 0) / window.length;

  const airNow = ext.air.get(originKey) ?? {};
  const airTgt = ext.air.get(targetKey) ?? airNow;
  const wNow = ext.weather.get(originKey) ?? {};
  const wTgt = ext.weather.get(targetKey) ?? wNow;

  const pm25Now = num(airNow.pm2_5, 20);
  const pm25Tgt = num(airTgt.pm2_5, pm25Now);
  const windNow = num(wNow.wind_speed_10m, 6) / 3.6; // API reports km/h
  const windTgt = num(wTgt.wind_speed_10m, 6) / 3.6;
  const tempNow = num(wNow.temperature_2m, 12);
  const tempTgt = num(wTgt.temperature_2m, tempNow);
  const pressureTgt = num(wTgt.surface_pressure, 1013);
  const cloudTgt = num(wTgt.cloud_cover, 50);
  const dirTgt = (num(wTgt.wind_direction_10m, 0) * Math.PI) / 180;

  const target = parseHourKey(targetKey);
  const hour = target.getUTCHours();
  const dow = target.getUTCDay();
  // Almaty is UTC+5 year-round; rush hours are local, so shift before testing.
  const localHour = (hour + 5) % 24;
  const isRush = (localHour >= 7 && localHour <= 10) || (localHour >= 17 && localHour <= 20) ? 1 : 0;

  return [
    l0.aqi,
    l1.aqi,
    l2.aqi,
    l3.aqi,
    (l6 ?? l3).aqi,
    mean3,
    mean6,
    l0.aqi - l1.aqi,
    l0.aqi - l3.aqi,
    stddev(window),
    l0.mq2,
    l0.mq4,
    l0.mq8,
    l0.mq135,
    num(l0.temp_c, tempNow),
    num(l0.humidity, num(wNow.relative_humidity_2m, 50)),
    pm25Now,
    pm25Tgt,
    pm25Tgt - pm25Now,
    num(airTgt.pm10, pm25Tgt * 1.7),
    num(airTgt.nitrogen_dioxide, 12),
    windTgt,
    windTgt - windNow,
    Math.sin(dirTgt),
    Math.cos(dirTgt),
    tempTgt,
    tempTgt - tempNow,
    num(wTgt.relative_humidity_2m, 50),
    pressureTgt,
    num(wTgt.precipitation, 0),
    cloudTgt,
    inversionIndex(windTgt, tempTgt, pressureTgt, cloudTgt, localHour),
    Math.sin((2 * Math.PI * localHour) / 24),
    Math.cos((2 * Math.PI * localHour) / 24),
    Math.sin((2 * Math.PI * dow) / 7),
    Math.cos((2 * Math.PI * dow) / 7),
    isRush,
    dow === 0 || dow === 6 ? 1 : 0,
  ];
}

export interface Dataset {
  X: number[][];
  y: number[];
  // Persistence baseline: "the next hours look like the current one". Kept per
  // row so validation can score the model against the honest do-nothing answer
  // — a forecast that can't beat it isn't worth showing.
  baseline: number[];
  externalOnly: number[];
  originKeys: string[];
}

export function emptyDataset(): Dataset {
  return { X: [], y: [], baseline: [], externalOnly: [], originKeys: [] };
}
