// Recommendation engine.
//
// Pure function. Takes the same numbers the status endpoint has and produces a
// prioritised list of human-facing advice: what to wear, what to bring, air /
// UV / heat / cold / wind / rain / pollen warnings. Each rule fires or not
// based on a threshold; profile sensitivity scales those thresholds.
//
// Rule pattern: guard → build recommendation. Explicit, greppable, testable.

import type {
  AirQualityExternal,
  PollenSnapshot,
  Profile,
  Recommendation,
  StatusLevel,
  WeatherSnapshot,
} from '../types.js';
import { PROFILES } from './profiles.js';

export interface EngineInput {
  status: StatusLevel;
  aqiComposite: number;
  weather: WeatherSnapshot | null;
  air: AirQualityExternal | null;
  pollen: PollenSnapshot | null;
  profile: Profile;
  smokeEvent?: boolean;
}

export interface EngineOutput {
  recommendations: Recommendation[];
  max_safe_duration_min: number;
}

const PRIO_ORDER: Record<Recommendation['priority'], number> = {
  danger: 0, warn: 1, advice: 2, info: 3,
};

export function generateRecommendations(input: EngineInput): EngineOutput {
  const p = PROFILES[input.profile];
  const recs: Recommendation[] = [];

  recs.push(...airRules(input, p.air_sensitivity));
  if (input.weather) {
    recs.push(...temperatureRules(input.weather, p));
    recs.push(...precipitationRules(input.weather));
    recs.push(...windRules(input.weather));
    recs.push(...uvRules(input.weather, p.uv_sensitivity));
  }
  if (input.pollen) recs.push(...pollenRules(input.pollen, p.pollen_sensitivity));
  if (input.smokeEvent) recs.push(smokeAlert());

  // Emphasized categories bubble up: bump advice→warn within emphasized set.
  const emphasized = new Set(p.emphasize);
  for (const r of recs) {
    if (emphasized.has(r.category as any) && r.priority === 'advice') r.priority = 'warn';
  }

  // Deduplicate by title, then order.
  const unique = new Map<string, Recommendation>();
  for (const r of recs) if (!unique.has(r.title)) unique.set(r.title, r);
  const sorted = [...unique.values()].sort(
    (a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority],
  );

  const duration = safeDurationMin(input, p);
  return { recommendations: sorted, max_safe_duration_min: duration };
}

// ─── Rule groups ──────────────────────────────────────────────────────────

function airRules(input: EngineInput, sens: number): Recommendation[] {
  const out: Recommendation[] = [];
  const pm = input.air?.pm2_5;
  const eff = pm != null ? pm * sens : input.aqiComposite / 3;

  if (eff >= 75) {
    out.push({
      category: 'air',
      priority: 'danger',
      icon: '⛔',
      title: 'Лучше остаться дома',
      body: 'Воздух опасно грязный. Отмените прогулку или сократите до нескольких минут; закройте окна.',
    });
  } else if (eff >= 35) {
    out.push({
      category: 'air',
      priority: 'warn',
      icon: '😷',
      title: 'Возьмите маску FFP2/N95',
      body: 'Уровень PM2.5 повышен. Тканевая маска не поможет — нужна плотная FFP2/KN95.',
    });
  } else if (eff >= 15) {
    out.push({
      category: 'air',
      priority: 'advice',
      icon: '🌫️',
      title: 'Гулять можно, но недолго',
      body: 'Воздух средний. Если гуляете с младенцем или у вас астма — ограничьте прогулку 30–60 минутами.',
    });
  }
  if (input.status === 'good' && eff < 15) {
    out.push({
      category: 'air',
      priority: 'info',
      icon: '🌿',
      title: 'Воздух чистый',
      body: 'Отличное время для прогулки.',
    });
  }
  return out;
}

function temperatureRules(w: WeatherSnapshot, p: { heat_sensitivity: number; cold_sensitivity: number }): Recommendation[] {
  const out: Recommendation[] = [];
  const feels = w.apparent_c;
  const heatThresh = 32 / p.heat_sensitivity;
  const extremeHeat = 38 / p.heat_sensitivity;

  if (feels >= extremeHeat) {
    out.push({
      category: 'heat',
      priority: 'danger',
      icon: '🥵',
      title: 'Аномальная жара',
      body: `Ощущается как +${Math.round(feels)}°C. Избегайте прогулок с 11:00 до 17:00, тепловой удар — реальный риск.`,
    });
  } else if (feels >= heatThresh) {
    out.push({
      category: 'heat',
      priority: 'warn',
      icon: '☀️',
      title: 'Жарко',
      body: `Ощущается как +${Math.round(feels)}°C. Головной убор, вода 0.5–1 л, гулять в тени.`,
    });
    out.push({
      category: 'bring',
      priority: 'advice',
      icon: '💧',
      title: 'Возьмите воду',
      body: 'В жару теряется до 1 литра пота в час, пейте до того, как захочется.',
    });
  }

  const coldThresh = -5 * p.cold_sensitivity;
  const extremeCold = -18 * p.cold_sensitivity;
  if (feels <= extremeCold) {
    out.push({
      category: 'cold',
      priority: 'danger',
      icon: '🥶',
      title: 'Опасный холод',
      body: `Ощущается ${Math.round(feels)}°C — риск обморожения открытых участков за 15–30 минут.`,
    });
    out.push({
      category: 'clothing',
      priority: 'warn',
      icon: '🧣',
      title: 'Многослойная одежда, шарф, варежки',
      body: 'Три слоя: термо, флис, ветрозащита. Шарф, шапка, варежки обязательны.',
    });
  } else if (feels <= coldThresh) {
    out.push({
      category: 'clothing',
      priority: 'advice',
      icon: '🧥',
      title: 'Тёплая куртка и шапка',
      body: `Ощущается ${Math.round(feels)}°C. Возьмите шапку и перчатки.`,
    });
  } else if (feels < 10) {
    out.push({
      category: 'clothing',
      priority: 'info',
      icon: '🧥',
      title: 'Куртка не помешает',
      body: `Ощущается ${Math.round(feels)}°C, свежо.`,
    });
  }
  return out;
}

function precipitationRules(w: WeatherSnapshot): Recommendation[] {
  const out: Recommendation[] = [];
  if (w.snowfall_cm > 0.5) {
    out.push({
      category: 'rain',
      priority: 'warn',
      icon: '❄️',
      title: 'Идёт снег',
      body: 'Непромокаемая обувь, тротуары скользкие.',
    });
  } else if (w.rain_mm > 2.5) {
    out.push({
      category: 'rain',
      priority: 'warn',
      icon: '🌧️',
      title: 'Сильный дождь',
      body: 'Дождевик или зонт. Обувь с рифлёной подошвой.',
    });
  } else if (w.rain_mm > 0.2) {
    out.push({
      category: 'bring',
      priority: 'advice',
      icon: '☂️',
      title: 'Возьмите зонт',
      body: 'Дождь слабый, но есть.',
    });
  }
  return out;
}

function windRules(w: WeatherSnapshot): Recommendation[] {
  const out: Recommendation[] = [];
  if (w.wind_gusts_ms >= 20 || w.wind_speed_ms >= 15) {
    out.push({
      category: 'wind',
      priority: 'danger',
      icon: '🌪️',
      title: 'Штормовой ветер',
      body: `Порывы до ${Math.round(w.wind_gusts_ms)} м/с. Опасность падающих веток и предметов.`,
    });
  } else if (w.wind_gusts_ms >= 12) {
    out.push({
      category: 'wind',
      priority: 'advice',
      icon: '💨',
      title: 'Сильный ветер',
      body: `Порывы до ${Math.round(w.wind_gusts_ms)} м/с. Легкий головной убор может слетать.`,
    });
  }
  return out;
}

function uvRules(w: WeatherSnapshot, sens: number): Recommendation[] {
  const out: Recommendation[] = [];
  const uv = w.uv_index * sens;
  if (uv >= 8) {
    out.push({
      category: 'uv',
      priority: 'warn',
      icon: '🕶️',
      title: 'Очень высокий УФ',
      body: `УФ-индекс ${w.uv_index.toFixed(1)}. Крем SPF 50+, очки, головной убор, тень с 11:00 до 16:00.`,
    });
  } else if (uv >= 6) {
    out.push({
      category: 'uv',
      priority: 'advice',
      icon: '🧴',
      title: 'Крем от солнца',
      body: `УФ ${w.uv_index.toFixed(1)}. SPF 30+ на лицо и открытые участки.`,
    });
  }
  return out;
}

function pollenRules(p: PollenSnapshot, sens: number): Recommendation[] {
  const rankThreshold = sens >= 1.5 ? 'moderate' : 'high';
  const order = ['none', 'low', 'moderate', 'high', 'very_high'] as const;
  const idx = order.indexOf(p.max_level);
  const thr = order.indexOf(rankThreshold as any);
  if (idx < thr) return [];

  const speciesRu: Record<string, string> = {
    alder: 'ольха',
    birch: 'берёза',
    olive: 'олива',
    grass: 'злаковые',
    mugwort: 'полынь',
    ragweed: 'амброзия',
  };
  const species = p.dominant ? speciesRu[p.dominant] ?? p.dominant : 'смесь';

  if (p.max_level === 'very_high') {
    return [{
      category: 'pollen',
      priority: 'warn',
      icon: '🌾',
      title: 'Пик пыльцы',
      body: `Очень высокий уровень (${species}). Аллергикам — маска, очки, антигистаминное, окна закрыты.`,
    }];
  }
  return [{
    category: 'pollen',
    priority: 'advice',
    icon: '🌾',
    title: 'Повышена пыльца',
    body: `Уровень ${p.max_level} (${species}). Аллергикам стоит принять препараты заранее.`,
  }];
}

function smokeAlert(): Recommendation {
  return {
    category: 'safety',
    priority: 'danger',
    icon: '🔥',
    title: 'Обнаружено задымление',
    body: 'Датчики зафиксировали резкий рост горючих газов и дыма поблизости. Закройте окна, не гуляйте.',
  };
}

function safeDurationMin(input: EngineInput, p: { air_sensitivity: number; heat_sensitivity: number }): number {
  // Simple: start at 180 min (3h) and knock down for each stressor.
  let mins = 180;
  const pm = input.air?.pm2_5 ?? input.aqiComposite / 3;
  const effPm = pm * p.air_sensitivity;
  if (effPm >= 75) mins = Math.min(mins, 10);
  else if (effPm >= 35) mins = Math.min(mins, 60);
  else if (effPm >= 15) mins = Math.min(mins, 120);

  const feels = input.weather?.apparent_c ?? 20;
  if (feels >= 38 / p.heat_sensitivity) mins = Math.min(mins, 15);
  else if (feels >= 32 / p.heat_sensitivity) mins = Math.min(mins, 45);
  if (feels <= -18) mins = Math.min(mins, 15);
  else if (feels <= -5) mins = Math.min(mins, 60);

  const uv = input.weather?.uv_index ?? 0;
  if (uv >= 10) mins = Math.min(mins, 30);
  else if (uv >= 8) mins = Math.min(mins, 60);

  if (input.smokeEvent) mins = 0;
  return Math.max(0, Math.round(mins));
}
