// "Your air in cigarettes" — Berkeley Earth's viral metric.
// One cigarette ≈ 22 µg/m³ of PM2.5 inhaled for 24 hours.
//   equivalent_cigs = (pm25_avg * hours) / (22 * 24) = (pm25 * hours) / 528
//
// Extended: also express as "shorter life" using WHO/Global Burden of Disease
// figures — chronic exposure to +10 µg/m³ over the WHO guideline (5 µg/m³
// annual) shortens average life expectancy by ≈ 0.6 years. We surface the
// current-day annualized figure honestly with the caveat that it assumes
// today's exposure holds year-round.

const WHO_ANNUAL_GUIDELINE = 5;   // µg/m³
const LIFE_LOSS_YEARS_PER_10_UGM3 = 0.6;
const CIG_UGM3_HOUR = 22 * 24;    // 528

export interface CigaretteResult {
  pm25_avg: number;
  hours_exposed: number;
  cigarettes: number;
  cigarettes_rounded: string;
  headline: string;
  vs_who_ratio: number;
  annualized_life_days_lost: number;
  disclaimer: string;
}

export function cigarettesFromExposure(pm25Avg: number, hoursExposed: number): CigaretteResult {
  const cigs = Math.max(0, (pm25Avg * hoursExposed) / CIG_UGM3_HOUR);
  const excess = Math.max(0, pm25Avg - WHO_ANNUAL_GUIDELINE);
  const lifeYearsIfAllYear = (excess / 10) * LIFE_LOSS_YEARS_PER_10_UGM3;
  return {
    pm25_avg: Math.round(pm25Avg * 10) / 10,
    hours_exposed: Math.round(hoursExposed * 10) / 10,
    cigarettes: Math.round(cigs * 100) / 100,
    cigarettes_rounded: cigs < 0.1 ? '< 0.1' : cigs.toFixed(1),
    headline: headlineFor(cigs, hoursExposed),
    vs_who_ratio: Math.round((pm25Avg / WHO_ANNUAL_GUIDELINE) * 10) / 10,
    annualized_life_days_lost: Math.round(lifeYearsIfAllYear * 365 * 10) / 10,
    disclaimer:
      'Оценка: 1 сигарета ≈ 22 µg/m³ PM2.5 за 24 ч (Berkeley Earth). ' +
      'Потеря жизни экстраполирована на год из сегодняшнего уровня — не медицинский диагноз.',
  };
}

function headlineFor(cigs: number, hours: number): string {
  if (cigs < 0.1) return `За ${hours.toFixed(0)} ч воздух ≈ 0 сигарет — дышите глубже.`;
  if (cigs < 1) return `За ${hours.toFixed(0)} ч вы «выкурили» ${cigs.toFixed(2)} сигареты.`;
  if (cigs < 5) return `За ${hours.toFixed(0)} ч — как ${cigs.toFixed(1)} сигарет.`;
  return `За ${hours.toFixed(0)} ч — как ${Math.round(cigs)} сигарет. Это уровень пачки в неделю.`;
}
