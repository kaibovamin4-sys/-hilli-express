// Profile-based sensitivity thresholds.
//
// The engine multiplies its base thresholds by a profile's sensitivity factor
// — asthma etc. tighten the safe band, athlete relaxes it slightly. Extras
// list which categories are elevated in priority for this profile.

import type { Profile } from '../types.js';

export interface ProfileConfig {
  label: string;
  air_sensitivity: number;    // >1 = more cautious
  uv_sensitivity: number;
  heat_sensitivity: number;
  cold_sensitivity: number;
  pollen_sensitivity: number;
  emphasize: Array<'air' | 'uv' | 'heat' | 'cold' | 'pollen' | 'wind' | 'rain'>;
}

export const PROFILES: Record<Profile, ProfileConfig> = {
  default: {
    label: 'Обычный взрослый',
    air_sensitivity: 1,
    uv_sensitivity: 1,
    heat_sensitivity: 1,
    cold_sensitivity: 1,
    pollen_sensitivity: 1,
    emphasize: [],
  },
  infant: {
    label: 'Младенец (0–2 года)',
    air_sensitivity: 1.6,
    uv_sensitivity: 1.6,
    heat_sensitivity: 1.7,
    cold_sensitivity: 1.5,
    pollen_sensitivity: 1.2,
    emphasize: ['air', 'uv', 'heat', 'cold'],
  },
  child: {
    label: 'Ребёнок (3–12 лет)',
    air_sensitivity: 1.35,
    uv_sensitivity: 1.4,
    heat_sensitivity: 1.3,
    cold_sensitivity: 1.2,
    pollen_sensitivity: 1.1,
    emphasize: ['air', 'uv'],
  },
  asthma: {
    label: 'Астма / ХОБЛ',
    air_sensitivity: 1.8,
    uv_sensitivity: 1,
    heat_sensitivity: 1.2,
    cold_sensitivity: 1.5,
    pollen_sensitivity: 1.5,
    emphasize: ['air', 'cold', 'pollen'],
  },
  allergy: {
    label: 'Аллергия / поллиноз',
    air_sensitivity: 1.1,
    uv_sensitivity: 1,
    heat_sensitivity: 1,
    cold_sensitivity: 1,
    pollen_sensitivity: 2,
    emphasize: ['pollen', 'air'],
  },
  elderly: {
    label: 'Пожилой человек',
    air_sensitivity: 1.4,
    uv_sensitivity: 1.1,
    heat_sensitivity: 1.6,
    cold_sensitivity: 1.5,
    pollen_sensitivity: 1,
    emphasize: ['air', 'heat', 'cold'],
  },
  athlete: {
    label: 'Спортсмен на тренировке',
    air_sensitivity: 1.5,   // при нагрузке дыхание глубже → доза больше
    uv_sensitivity: 1.1,
    heat_sensitivity: 1.4,
    cold_sensitivity: 0.9,
    pollen_sensitivity: 1,
    emphasize: ['air', 'heat'],
  },
  pregnant: {
    label: 'Беременность',
    air_sensitivity: 1.5,
    uv_sensitivity: 1.1,
    heat_sensitivity: 1.5,
    cold_sensitivity: 1.1,
    pollen_sensitivity: 1,
    emphasize: ['air', 'heat'],
  },
};
