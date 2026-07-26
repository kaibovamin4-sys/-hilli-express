// "Что взять с собой" — a packing checklist for the next couple of hours.
//
// The backend's recommendation engine already explains *why* conditions are
// what they are; this turns the same payload into the one thing someone
// actually does before leaving: pick items off a hook by the door. Rules live
// on the client because they are pure presentation over fields the status
// response already carries — no extra request, and the list updates the
// instant the profile changes.

import { useMemo } from 'react';
import type { FullStatus, Profile } from '../lib/api';
import { RecIcon, type IconKey } from './ui/RecIcon';

export interface BringItem {
  /** Icon KEY resolved by `<RecIcon>` — never a glyph. See ui/RecIcon.tsx. */
  icon: IconKey;
  title: string;
  why: string;
  /** essential = red dot, useful = amber, optional = plain. */
  level: 'essential' | 'useful' | 'optional';
}

const LEVEL_COLOR: Record<BringItem['level'], string> = {
  essential: 'var(--bad)',
  useful: 'var(--mid)',
  optional: 'var(--muted)',
};

const LEVEL_LABEL: Record<BringItem['level'], string> = {
  essential: 'обязательно',
  useful: 'пригодится',
  optional: 'по желанию',
};

const SENSITIVE: Profile[] = ['infant', 'child', 'asthma', 'allergy', 'elderly', 'pregnant'];

export function buildBringList(status: FullStatus, profile: Profile): BringItem[] {
  const items: BringItem[] = [];
  const w = status.external.weather;
  const air = status.external.air_quality;
  const pollen = status.external.pollen;
  const pm25 = status.fusion?.pm25 ?? air?.pm2_5 ?? null;
  const sensitive = SENSITIVE.includes(profile);

  if (pm25 != null && pm25 >= 35) {
    items.push({
      icon: 'mask',
      title: 'Респиратор FFP2 / N95',
      why: `PM2.5 ${Math.round(pm25)} µg/m³ — тканевая маска частицы такого размера не задерживает.`,
      level: 'essential',
    });
  } else if (pm25 != null && pm25 >= 15 && sensitive) {
    items.push({
      icon: 'mask',
      title: 'Маска на всякий случай',
      why: 'Воздух умеренный, но у чувствительной группы реакция начинается раньше.',
      level: 'useful',
    });
  }

  if (profile === 'asthma') {
    items.push({
      icon: 'wind',
      title: 'Ингалятор',
      why: 'Всегда с собой: при астме приступ может начаться от холодного или запылённого воздуха.',
      level: 'essential',
    });
  }

  if (profile === 'allergy' && pollen && pollen.max_level !== 'none' && pollen.max_level !== 'low') {
    items.push({
      icon: 'allergy',
      title: 'Антигистаминное и салфетки',
      why: `Пыльца: уровень «${pollen.max_level}»${pollen.dominant ? `, преобладает ${pollen.dominant}` : ''}.`,
      level: 'essential',
    });
  }

  if (w) {
    if (w.temperature_c >= 25) {
      items.push({
        icon: 'water',
        title: 'Вода',
        why: `${Math.round(w.temperature_c)} °C — на жаре обезвоживание наступает быстрее, чем чувствуется жажда.`,
        level: w.temperature_c >= 30 ? 'essential' : 'useful',
      });
      items.push({
        icon: 'cap',
        title: 'Головной убор',
        why: 'Прямое солнце в полдень — главный источник теплового удара.',
        level: 'useful',
      });
    }
    if (w.uv_index >= 6) {
      items.push({
        icon: 'sunscreen',
        title: `Крем SPF 30+`,
        why: `УФ-индекс ${Math.round(w.uv_index)} — незащищённая кожа краснеет за 20–30 минут.`,
        level: w.uv_index >= 8 ? 'essential' : 'useful',
      });
      items.push({
        icon: 'sunglasses',
        title: 'Очки с UV-фильтром',
        why: 'Высокий УФ бьёт и по глазам, а не только по коже.',
        level: 'optional',
      });
    }
    if (w.rain_mm > 0.1) {
      items.push({
        icon: 'umbrella',
        title: 'Зонт или дождевик',
        why: `Осадки ${w.rain_mm.toFixed(1)} мм/ч. Плюс: дождь вымывает пыль, после него воздух чище.`,
        level: 'essential',
      });
    }
    if (w.snowfall_cm > 0) {
      items.push({
        icon: 'boots',
        title: 'Нескользящая обувь',
        why: `Снег ${w.snowfall_cm.toFixed(1)} см — тротуары в городе чистят неравномерно.`,
        level: 'useful',
      });
    }
    if (w.apparent_c <= 0) {
      items.push({
        icon: 'scarf',
        title: 'Шарф или баф',
        why: `Ощущается как ${Math.round(w.apparent_c)} °C. Дышать через ткань — воздух успевает согреться.`,
        level: w.apparent_c <= -10 ? 'essential' : 'useful',
      });
      items.push({
        icon: 'gloves',
        title: 'Перчатки',
        why: 'Руки мёрзнут первыми, особенно если гуляете с коляской.',
        level: 'useful',
      });
    }
    if (w.wind_speed_ms >= 8) {
      items.push({
        icon: 'coat',
        title: 'Ветровка',
        why: `Ветер ${w.wind_speed_ms.toFixed(0)} м/с — с ним холод ощущается на несколько градусов ниже.`,
        level: 'useful',
      });
    }
  }

  if (profile === 'infant' || profile === 'child') {
    items.push({
      icon: 'baby',
      title: 'Вода и перекус для ребёнка',
      why: `Комфортное время на улице сегодня — около ${status.max_safe_duration_min} мин.`,
      level: 'useful',
    });
  }

  if (profile === 'athlete' && pm25 != null && pm25 >= 25) {
    items.push({
      icon: 'exercise',
      title: 'Перенести тренировку в зал',
      why: 'На нагрузке вентиляция лёгких растёт в 5–10 раз, вместе с ней и доза частиц.',
      level: 'essential',
    });
  }

  if (items.length === 0) {
    items.push({
      icon: 'nothing',
      title: 'Ничего особенного',
      why: 'Погода и воздух спокойные — можно выходить как есть.',
      level: 'optional',
    });
  }

  const rank = { essential: 0, useful: 1, optional: 2 } as const;
  return items.sort((a, b) => rank[a.level] - rank[b.level]);
}

export default function BringList({ status, profile }: { status: FullStatus; profile: Profile }) {
  const items = useMemo(() => buildBringList(status, profile), [status, profile]);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.title}
          className="flex items-start gap-3 rounded-xl bg-fill border border-line px-3.5 py-3"
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fill-hover"
            style={{ color: LEVEL_COLOR[item.level] }}
          >
            <RecIcon icon={item.icon} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-base text-gray-100">{item.title}</span>
              <span
                className="text-2xs uppercase tracking-[0.08em]"
                style={{ color: LEVEL_COLOR[item.level] }}
              >
                {LEVEL_LABEL[item.level]}
              </span>
            </div>
            <p className="text-sm text-muted leading-relaxed mt-0.5">{item.why}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
