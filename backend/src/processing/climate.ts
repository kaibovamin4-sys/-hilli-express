// Derived climate values from the station's DHT22 (temperature + humidity).
//
// The DHT22 already feeds the gas pipeline as a compensation input, but on its
// own it answers questions the gas sensors can't: how cold it actually feels,
// whether it's dry enough to irritate airways, whether the air is close to
// saturation. Everything here is a pure function of (T, RH) so it can be
// computed for a live reading and for any point of a history series alike.

export interface ClimateDerived {
  temp_c: number;
  humidity: number;
  /** Temperature at which this air would start condensing, °C. */
  dew_point_c: number;
  /** Water actually in the air, g/m³ — unlike RH this is comparable across days. */
  absolute_humidity: number;
  /** Perceived temperature: heat index when warm, wind chill-free cold index otherwise. */
  feels_like_c: number;
  comfort: 'сухо' | 'комфортно' | 'влажно' | 'душно' | 'морозно';
  comfort_note: string;
}

// Magnus-Tetens coefficients over water; accurate to ~0.4 °C for -45..60 °C,
// which comfortably covers Almaty and the DHT22's own rated range.
const MAGNUS_B = 17.62;
const MAGNUS_C = 243.12;

export function dewPoint(tempC: number, humidity: number): number {
  const rh = Math.min(100, Math.max(1, humidity));
  const gamma = Math.log(rh / 100) + (MAGNUS_B * tempC) / (MAGNUS_C + tempC);
  return (MAGNUS_C * gamma) / (MAGNUS_B - gamma);
}

/** Inverse of {@link dewPoint}: relative humidity for a given air/dew pair. */
export function humidityFromDewPoint(tempC: number, dewC: number): number {
  const gamma = (MAGNUS_B * dewC) / (MAGNUS_C + dewC) - (MAGNUS_B * tempC) / (MAGNUS_C + tempC);
  return Math.min(100, Math.max(1, 100 * Math.exp(gamma)));
}

/**
 * Absolute humidity in g/m³ from the Magnus saturation-vapour-pressure curve
 * and the ideal gas law.
 */
export function absoluteHumidity(tempC: number, humidity: number): number {
  const rh = Math.min(100, Math.max(0, humidity));
  const svp = 6.112 * Math.exp((MAGNUS_B * tempC) / (MAGNUS_C + tempC)); // hPa
  return (2.1674 * svp * rh) / (273.15 + tempC);
}

/**
 * Rothfusz heat index above 27 °C. Below that the formula is not defined, and
 * in the cold what actually matters here is dryness rather than wind (a static
 * station has no anemometer), so we return the measured temperature.
 */
export function feelsLike(tempC: number, humidity: number): number {
  if (tempC < 27) return tempC;
  const t = (tempC * 9) / 5 + 32;
  const r = humidity;
  const hiF =
    -42.379 +
    2.04901523 * t +
    10.14333127 * r -
    0.22475541 * t * r -
    0.00683783 * t * t -
    0.05481717 * r * r +
    0.00122874 * t * t * r +
    0.00085282 * t * r * r -
    0.00000199 * t * t * r * r;
  return Math.round((((hiF - 32) * 5) / 9) * 10) / 10;
}

function comfortOf(tempC: number, humidity: number, dew: number): Pick<ClimateDerived, 'comfort' | 'comfort_note'> {
  if (tempC <= -5) {
    return { comfort: 'морозно', comfort_note: 'Мороз: прикрывайте лицо, дышите носом — холодный воздух сушит бронхи.' };
  }
  if (dew >= 20) {
    return { comfort: 'душно', comfort_note: 'Точка росы выше 20 °C — воздух насыщен влагой, нагрузка переносится тяжело.' };
  }
  if (humidity >= 75) {
    return { comfort: 'влажно', comfort_note: 'Высокая влажность: испарения хуже, одевайтесь легче, чем подсказывает термометр.' };
  }
  if (humidity <= 25) {
    return { comfort: 'сухо', comfort_note: 'Сухой воздух раздражает слизистые — пейте воду, аллергикам стоит взять спрей.' };
  }
  return { comfort: 'комфортно', comfort_note: 'Температура и влажность в комфортном диапазоне.' };
}

export function deriveClimate(tempC: number, humidity: number): ClimateDerived {
  const dew = Math.round(dewPoint(tempC, humidity) * 10) / 10;
  return {
    temp_c: Math.round(tempC * 10) / 10,
    humidity: Math.round(humidity),
    dew_point_c: dew,
    absolute_humidity: Math.round(absoluteHumidity(tempC, humidity) * 10) / 10,
    feels_like_c: feelsLike(tempC, humidity),
    ...comfortOf(tempC, humidity, dew),
  };
}
