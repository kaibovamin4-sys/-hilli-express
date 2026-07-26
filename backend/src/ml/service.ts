// Trains and serves the 6-hour AQI forecast model.
//
// One GBDT per horizon (h = 1..6), pooled across every station: with a handful
// of stations and a few days of history, a per-station model would be fitting
// noise, while the physics it needs to learn (wind clears the valley, calm
// nights trap smog) is the same everywhere in the city. Station identity still
// reaches the model through its own lag features, which carry each site's
// baseline.
//
// Validation is a *time-based* holdout, not a random split: the last 25% of
// hours are never seen during training. Shuffling would leak the target hour's
// neighbours into training and report a flattering error that the live
// forecast could never reproduce.

import {
  hourlyAggregates,
  listDevices,
  type HourlyAggregate,
} from '../db/repositories.js';
import { getAirQualitySeries, getWeatherSeries } from '../external/openMeteo.js';
import { aqiToPm, pmToAqi } from '../processing/aqi.js';
import { levelFromPm25 } from '../processing/status.js';
import type { StatusLevel } from '../types.js';
import {
  FEATURE_LABELS,
  FEATURE_NAMES,
  addHours,
  buildFeatureRow,
  emptyDataset,
  hourKey,
  indexSeries,
  type Dataset,
  type ExternalContext,
} from './features.js';
import { DEFAULT_GBDT, evaluate, predictGbdt, trainGbdt, type GbdtModel, type Metrics } from './gbdt.js';

export const HORIZONS = [1, 2, 3, 4, 5, 6] as const;
export type Horizon = (typeof HORIZONS)[number];

const HISTORY_DAYS = 7;
const EXT_PM25_TARGET_IDX = FEATURE_NAMES.indexOf('ext_pm25_target');
const MIN_TRAIN_ROWS = 60;
const VALIDATION_FRACTION = 0.25;

export interface HorizonModel {
  horizon: number;
  model: GbdtModel;
  metrics: Metrics;
  baseline: Metrics;
  externalOnly: Metrics;
  /** σ of validation residuals — the half-width of the ±1σ band on the chart. */
  residualStd: number;
}

export interface FeatureImportance {
  feature: string;
  label: string;
  importance: number;
}

export interface TrainedModel {
  trained_at: string;
  train_rows: number;
  validation_rows: number;
  stations: number;
  history_days: number;
  horizons: Map<number, HorizonModel>;
  importance: FeatureImportance[];
  hyperparameters: {
    rounds: number;
    learning_rate: number;
    max_depth: number;
    min_samples_leaf: number;
    subsample: number;
  };
}

let current: TrainedModel | null = null;
let training: Promise<TrainedModel | null> | null = null;
let lastError: string | null = null;

export function modelState(): { model: TrainedModel | null; error: string | null; training: boolean } {
  return { model: current, error: lastError, training: training !== null };
}

async function externalContext(lat: number, lng: number): Promise<ExternalContext> {
  const [air, weather] = await Promise.all([
    getAirQualitySeries(lat, lng),
    getWeatherSeries(lat, lng),
  ]);
  return { air: indexSeries(air), weather: indexSeries(weather) };
}

function toMap(rows: HourlyAggregate[]): Map<string, HourlyAggregate> {
  return new Map(rows.map((r) => [r.hour, r]));
}

/**
 * Assembles the training matrix for one horizon across every active station.
 * Rows are emitted in chronological order so the caller can cut a holdout off
 * the end without sorting again.
 */
function buildDataset(
  perDevice: Array<{ byHour: Map<string, HourlyAggregate>; ext: ExternalContext }>,
  horizon: number,
): Dataset {
  const ds = emptyDataset();
  for (const { byHour, ext } of perDevice) {
    for (const [originKey, origin] of byHour) {
      const targetKey = addHours(originKey, horizon);
      const target = byHour.get(targetKey);
      if (!target) continue;
      const row = buildFeatureRow(byHour, originKey, targetKey, ext);
      if (!row) continue;
      ds.X.push(row);
      ds.y.push(target.aqi);
      ds.baseline.push(origin.aqi);
      // Open-Meteo predicts PM2.5 in µg/m³ while the target is our composite
      // index; without converting, this "baseline" would be an error of scale
      // rather than of skill.
      ds.externalOnly.push(pmToAqi(row[EXT_PM25_TARGET_IDX]!));
      ds.originKeys.push(originKey);
    }
  }
  const order = ds.originKeys.map((k, i) => [k, i] as const).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    X: order.map(([, i]) => ds.X[i]!),
    y: order.map(([, i]) => ds.y[i]!),
    baseline: order.map(([, i]) => ds.baseline[i]!),
    externalOnly: order.map(([, i]) => ds.externalOnly[i]!),
    originKeys: order.map(([k]) => k),
  };
}

export async function trainModels(): Promise<TrainedModel | null> {
  if (training) return training;
  training = (async () => {
    try {
      const devices = listDevices(true);
      if (devices.length === 0) throw new Error('no active devices');

      const since = new Date(Date.now() - HISTORY_DAYS * 24 * 3_600_000).toISOString();
      const perDevice: Array<{ byHour: Map<string, HourlyAggregate>; ext: ExternalContext }> = [];
      for (const d of devices) {
        const rows = hourlyAggregates(d.id, since);
        if (rows.length < 8) continue;
        perDevice.push({ byHour: toMap(rows), ext: await externalContext(d.lat, d.lng) });
      }
      if (perDevice.length === 0) throw new Error('not enough history');

      const horizons = new Map<number, HorizonModel>();
      const importanceTotal = new Array<number>(FEATURE_NAMES.length).fill(0);
      let trainRows = 0;
      let valRows = 0;

      for (const h of HORIZONS) {
        const ds = buildDataset(perDevice, h);
        if (ds.X.length < MIN_TRAIN_ROWS) throw new Error(`only ${ds.X.length} rows for h=${h}`);

        const cut = Math.floor(ds.X.length * (1 - VALIDATION_FRACTION));
        const model = trainGbdt(ds.X.slice(0, cut), ds.y.slice(0, cut), DEFAULT_GBDT);

        const valX = ds.X.slice(cut);
        const valY = ds.y.slice(cut);
        const predicted = valX.map((x) => Math.max(0, predictGbdt(model, x)));

        const metrics = evaluate(valY, predicted);
        const residuals = valY.map((v, i) => v - predicted[i]!);
        const residualStd = Math.sqrt(
          residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, residuals.length),
        );

        horizons.set(h, {
          horizon: h,
          model,
          metrics,
          baseline: evaluate(valY, ds.baseline.slice(cut)),
          externalOnly: evaluate(valY, ds.externalOnly.slice(cut)),
          residualStd: Math.round(residualStd * 10) / 10,
        });

        for (let i = 0; i < importanceTotal.length; i++) {
          importanceTotal[i]! += model.importance[i] ?? 0;
        }
        trainRows = cut;
        valRows = valX.length;
      }

      const sum = importanceTotal.reduce((s, v) => s + v, 0) || 1;
      const importance: FeatureImportance[] = FEATURE_NAMES.map((name, i) => ({
        feature: name,
        label: FEATURE_LABELS[name] ?? name,
        importance: Math.round((importanceTotal[i]! / sum) * 1000) / 1000,
      }))
        .filter((f) => f.importance > 0)
        .sort((a, b) => b.importance - a.importance);

      current = {
        trained_at: new Date().toISOString(),
        train_rows: trainRows,
        validation_rows: valRows,
        stations: perDevice.length,
        history_days: HISTORY_DAYS,
        horizons,
        importance,
        hyperparameters: {
          rounds: DEFAULT_GBDT.rounds,
          learning_rate: DEFAULT_GBDT.learningRate,
          max_depth: DEFAULT_GBDT.maxDepth,
          min_samples_leaf: DEFAULT_GBDT.minSamplesLeaf,
          subsample: DEFAULT_GBDT.subsample,
        },
      };
      lastError = null;
      return current;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      training = null;
    }
  })();
  return training;
}

export interface MlForecastPoint {
  ts: string;
  horizon: number;
  aqi: number;
  pm25: number;
  status: StatusLevel;
  /** ±1σ of the model's own validation residuals, in AQI units. */
  aqi_low: number;
  aqi_high: number;
  confidence: number;
  baseline_aqi: number;
}

export interface MlForecastResult {
  device_id: string;
  generated_at: string;
  horizon_hours: number;
  points: MlForecastPoint[];
  model: {
    method: string;
    trained_at: string;
    stations: number;
    train_rows: number;
    validation_rows: number;
    history_days: number;
    hyperparameters: TrainedModel['hyperparameters'];
    accuracy: Array<{
      horizon: number;
      mae: number;
      rmse: number;
      r2: number;
      baseline_mae: number;
      external_mae: number;
      improvement_vs_baseline: number;
    }>;
    importance: FeatureImportance[];
  };
}

/**
 * `confidence` maps the model's own residual σ onto 0..1 against a reference
 * spread of 40 AQI points, so a horizon the model genuinely nails reads as
 * confident and a noisy one degrades smoothly rather than by a fixed schedule.
 */
function confidenceFrom(residualStd: number): number {
  return Math.round(Math.max(0.2, Math.min(0.97, 1 - residualStd / 40)) * 100) / 100;
}

export async function mlForecast(
  deviceId: string,
  lat: number,
  lng: number,
  horizonHours = 6,
): Promise<MlForecastResult | null> {
  const trained = current ?? (await trainModels());
  if (!trained) return null;

  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 3_600_000).toISOString();
  const byHour = toMap(hourlyAggregates(deviceId, since));
  if (byHour.size === 0) return null;

  const ext = await externalContext(lat, lng);
  const now = new Date();
  // The current hour is still filling up, so anchor on the last hour that has
  // a complete average — otherwise lag0 is a one-sample estimate.
  const originKey = byHour.has(hourKey(now)) && byHour.get(hourKey(now))!.samples >= 2
    ? hourKey(now)
    : addHours(hourKey(now), -1);
  const origin = byHour.get(originKey);
  if (!origin) return null;

  const points: MlForecastPoint[] = [];
  for (const h of HORIZONS) {
    if (h > horizonHours) break;
    const hm = trained.horizons.get(h);
    if (!hm) continue;
    const targetKey = addHours(originKey, h);
    const row = buildFeatureRow(byHour, originKey, targetKey, ext);
    if (!row) continue;

    const aqi = Math.max(0, predictGbdt(hm.model, row));
    const pm25 = aqiToPm(aqi);
    points.push({
      ts: new Date(`${targetKey}:00.000Z`).toISOString(),
      horizon: h,
      aqi: Math.round(aqi),
      pm25: Math.round(pm25 * 10) / 10,
      status: levelFromPm25(pm25),
      aqi_low: Math.max(0, Math.round(aqi - hm.residualStd)),
      aqi_high: Math.round(aqi + hm.residualStd),
      confidence: confidenceFrom(hm.residualStd),
      baseline_aqi: Math.round(origin.aqi),
    });
  }
  if (points.length === 0) return null;

  return {
    device_id: deviceId,
    generated_at: now.toISOString(),
    horizon_hours: points.length,
    points,
    model: {
      method:
        'Градиентный бустинг решающих деревьев (по модели на каждый час горизонта), ' +
        `${FEATURE_NAMES.length} признаков: лаги станции, DHT22, прогноз Open-Meteo на целевой час, индекс инверсии`,
      trained_at: trained.trained_at,
      stations: trained.stations,
      train_rows: trained.train_rows,
      validation_rows: trained.validation_rows,
      history_days: trained.history_days,
      hyperparameters: trained.hyperparameters,
      accuracy: [...trained.horizons.values()].map((hm) => ({
        horizon: hm.horizon,
        mae: hm.metrics.mae,
        rmse: hm.metrics.rmse,
        r2: hm.metrics.r2,
        baseline_mae: hm.baseline.mae,
        external_mae: hm.externalOnly.mae,
        improvement_vs_baseline:
          hm.baseline.mae > 0
            ? Math.round((1 - hm.metrics.mae / hm.baseline.mae) * 1000) / 10
            : 0,
      })),
      importance: trained.importance.slice(0, 12),
    },
  };
}
