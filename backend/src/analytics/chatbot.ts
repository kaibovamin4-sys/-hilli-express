// Rule-based assistant, no LLM. Detects intent from keyword patterns and fills
// response templates with live data (status, weather, pollen, traffic,
// construction, forecast). If nothing matches, it says so and lists what it
// can answer.

import type { FullStatus } from '../types.js';
import type { TrafficInfo } from '../external/traffic.js';
import type { ConstructionImpact } from '../external/construction.js';

export interface ChatContext {
  status: FullStatus;
  traffic: TrafficInfo;
  construction: ConstructionImpact;
}

export interface ChatReply {
  intent: string;
  reply: string;
  suggestions: string[];
}

interface Intent {
  id: string;
  patterns: RegExp[];
  answer: (ctx: ChatContext) => string;
}

const STATUS_RU: Record<string, string> = {
  good: 'можно гулять',
  moderate: 'гулять недолго',
  bad: 'лучше остаться дома',
};

// Order matters: specific intents (kids, pollen, mask...) are checked before
// the generic 'walk' so "гулять с ребёнком" lands on kids, not walk.
const INTENTS: Intent[] = [
  {
    id: 'kids',
    patterns: [/ребён|ребен|дет(и|ям|ьми)|младен|коляск|школьник/i],
    answer: (c) => {
      const s = c.status;
      const map: Record<string, string> = {
        good: `Воздух чистый — с детьми гулять можно спокойно, до ${s.max_safe_duration_min} мин без ограничений.`,
        moderate: 'Воздух средний: с младенцем — не дольше 30–40 минут, детям постарше можно час. Избегайте крупных дорог и строек.',
        bad: 'Сегодня с детьми лучше остаться дома: закройте окна, включите очиститель. Если выйти необходимо — коротко и не у дорог.',
      };
      return map[s.status]!;
    },
  },
  {
    id: 'walk',
    patterns: [/гулять|прогулк|выйти|выходить|на улиц|погулять/i],
    answer: (c) => {
      const s = c.status;
      const base = `Сейчас статус — «${STATUS_RU[s.status]}» (${s.status_reason}). Безопасная длительность прогулки: ~${s.max_safe_duration_min} мин.`;
      const win = s.best_walk_window
        ? ` Лучшее окно сегодня: ${fmtTime(s.best_walk_window.start)}–${fmtTime(s.best_walk_window.end)} (${s.best_walk_window.reason}).`
        : '';
      return base + win;
    },
  },
  {
    id: 'pollen',
    patterns: [/пыльц|аллерг|поллиноз|чихат|берёз|полын|амброз/i],
    answer: (c) => {
      const p = c.status.external.pollen;
      if (!p) return 'Данных о пыльце сейчас нет — источник недоступен.';
      const levels: Record<string, string> = {
        none: 'пыльцы практически нет', low: 'уровень пыльцы низкий',
        moderate: 'уровень пыльцы умеренный', high: 'уровень пыльцы высокий',
        very_high: 'пик пыльцы — очень высокий уровень',
      };
      const base = `Сейчас ${levels[p.max_level] ?? p.max_level}${p.dominant ? ` (доминирует ${speciesRu(p.dominant)})` : ''}.`;
      const advice = p.max_level === 'none' || p.max_level === 'low'
        ? ' Аллергикам гулять можно спокойно.'
        : ' Аллергикам: примите антигистаминное заранее, наденьте очки и маску, после прогулки промойте нос и умойтесь.';
      return base + advice;
    },
  },
  {
    id: 'dust',
    patterns: [/пыль(?!ц)|pm10|песок|грязный воздух|смог/i],
    answer: (c) => {
      const a = c.status.external.air_quality;
      const dustPart = a?.pm10 != null ? `PM10 (крупная пыль): ${a.pm10} µg/m³. ` : '';
      const pmPart = a?.pm2_5 != null ? `PM2.5 (мелкие частицы): ${a.pm2_5} µg/m³. ` : '';
      const constr = c.construction.inside_zone
        ? `Рядом стройка (${c.construction.nearest?.name}, ${c.construction.nearest?.distance_km} км) — локально пыли больше. `
        : '';
      return dustPart + pmPart + constr + (a?.pm10 != null && a.pm10 > 50
        ? 'Пыли много: детям и людям с астмой лучше сократить время на улице.'
        : 'Уровень пыли приемлемый.');
    },
  },
  {
    id: 'weather',
    patterns: [/погод|температур|дожд|ветер|снег|жара|холод|зонт|одеться|надеть/i],
    answer: (c) => {
      const w = c.status.external.weather;
      if (!w) return 'Погодные данные сейчас недоступны.';
      const clothing = c.status.recommendations
        .filter((r) => r.category === 'clothing' || r.category === 'bring' || r.category === 'rain')
        .map((r) => r.body).join(' ');
      return `Сейчас ${Math.round(w.temperature_c)}°C, влажность ${Math.round(w.humidity)}%, ветер ${Math.round(w.wind_speed_ms)} м/с, УФ-индекс ${w.uv_index.toFixed(1)}. ${clothing || 'Особых требований к одежде нет.'}`;
    },
  },
  {
    id: 'traffic',
    patterns: [/пробк|трафик|дорог|машин|час пик/i],
    answer: (c) => {
      const t = c.traffic;
      const lvl: Record<string, string> = {
        free: 'дороги свободны', moderate: 'умеренная загрузка',
        heavy: 'плотные пробки', jam: 'заторы',
      };
      const near = t.nearest_corridor
        ? ` Ближайшая магистраль — ${t.nearest_corridor.name} (${t.nearest_corridor.distance_km} км), загрузка ${t.nearest_corridor.load}/10.`
        : '';
      return `Индекс пробок у вас: ${t.index}/10 (${lvl[t.level]}), по городу ${t.city_average}/10.${near}${t.is_rush_hour ? ' Сейчас час пик — у крупных дорог воздух хуже, гуляйте во дворах и парках.' : ''} (${t.model_note})`;
    },
  },
  {
    id: 'construction',
    patterns: [/стройк|застройк|строительств|котлован|ремонт дорог/i],
    answer: (c) => {
      const ci = c.construction;
      if (!ci.nearest) return 'Данных о стройках рядом нет.';
      const inside = ci.inside_zone
        ? `Вы в зоне пылевого влияния стройки «${ci.nearest.name}» (${ci.nearest.distance_km} км). Здесь гулять не стоит — крупная пыль и шум. `
        : `Ближайшая стройка — «${ci.nearest.name}» в ${ci.nearest.distance_km} км, вы вне зоны её влияния. `;
      return inside + `Всего строек в радиусе 2 км: ${ci.sites_within_2km}. (${ci.demo_note})`;
    },
  },
  {
    id: 'mask',
    patterns: [/маск|респиратор|ffp|kn95|защит/i],
    answer: (c) => {
      const pm = c.status.external.air_quality?.pm2_5;
      if (pm == null) return 'Нет данных PM2.5, но при видимом смоге надевайте FFP2/KN95 — тканевые маски от частиц не защищают.';
      return pm >= 35
        ? `PM2.5 сейчас ${pm} µg/m³ — маска нужна: FFP2/KN95, плотно прилегающая. Тканевая не поможет.`
        : `PM2.5 сейчас ${pm} µg/m³ — маска не обязательна. Понадобится при уровне выше 35.`;
    },
  },
  {
    id: 'window',
    patterns: [/проветр|окн(о|а)|форточк/i],
    answer: (c) => {
      const pm = c.status.external.air_quality?.pm2_5;
      return pm != null && pm < 20
        ? `PM2.5 снаружи ${pm} µg/m³ — можно проветривать, лучше 10–15 минут за раз.`
        : `PM2.5 снаружи ${pm ?? '—'} µg/m³ — проветривание отложите или делайте короткими всплесками по 5 минут.`;
    },
  },
  {
    id: 'why',
    patterns: [/почему|откуда|как (вы )?счита|источник|достовер/i],
    answer: (c) =>
      `Оценка собирается из трёх слоёв: (1) городской фон PM2.5 — модель Open-Meteo; (2) наши MQ-датчики (MQ2/MQ4/MQ8) ловят локальные события — дым, газ, выбросы — и корректируют фон рядом со станцией; (3) слои города: пробки и стройки добавляют штраф в местах, где воздух заведомо хуже. Текущая причина статуса: ${c.status.status_reason}. Уверенность оценки: ${Math.round(c.status.confidence * 100)}%.`,
  },
  {
    id: 'sport',
    patterns: [/спорт|бег|пробежк|велосипед|тренир/i],
    answer: (c) => {
      const map: Record<string, string> = {
        good: 'Воздух чистый — тренируйтесь на улице спокойно. Лучшие места — парки, подальше от магистралей.',
        moderate: 'При нагрузке дыхание глубже, доза загрязнителей выше. Сегодня интенсивную тренировку лучше перенести в зал, лёгкая прогулка — ок.',
        bad: 'Спорт на улице сегодня — плохая идея: при беге вы вдыхаете в 5–10 раз больше воздуха. Только зал.',
      };
      return map[c.status.status]!;
    },
  },
];

const FALLBACK_SUGGESTIONS = [
  'Можно ли сейчас гулять?',
  'Что с пыльцой для аллергиков?',
  'Какая погода и что надеть?',
  'Есть ли пробки рядом?',
  'Можно ли проветривать?',
];

export function chat(message: string, ctx: ChatContext): ChatReply {
  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => p.test(message))) {
      return {
        intent: intent.id,
        reply: intent.answer(ctx),
        suggestions: pickSuggestions(intent.id),
      };
    }
  }
  return {
    intent: 'unknown',
    reply:
      'Я отвечаю на вопросы о воздухе и прогулках в Алматы: статус сейчас, пыльца и аллергия, пыль, погода и одежда, пробки, стройки, маски, проветривание, спорт, дети. Спросите, например: «Можно ли гулять с ребёнком?»',
    suggestions: FALLBACK_SUGGESTIONS,
  };
}

function pickSuggestions(excludeIntent: string): string[] {
  const map: Record<string, string> = {
    walk: 'Можно ли сейчас гулять?',
    pollen: 'Что с пыльцой?',
    weather: 'Что надеть на улицу?',
    traffic: 'Есть ли пробки рядом?',
    construction: 'Где сейчас стройки?',
    kids: 'Можно ли гулять с ребёнком?',
    mask: 'Нужна ли маска?',
    window: 'Можно ли проветривать?',
    sport: 'Можно ли бегать на улице?',
  };
  return Object.entries(map)
    .filter(([k]) => k !== excludeIntent)
    .slice(0, 4)
    .map(([, v]) => v);
}

function speciesRu(s: string): string {
  const map: Record<string, string> = {
    alder: 'ольха', birch: 'берёза', olive: 'олива',
    grass: 'злаковые', mugwort: 'полынь', ragweed: 'амброзия',
  };
  return map[s] ?? s;
}

function fmtTime(iso: string): string {
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1]! : iso;
}
