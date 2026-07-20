// MQ sensor calibration.
//
// Sensor output is an ADC reading (0..1023 on ESP8266). Path:
//   ADC → Vout → Rs (sensor resistance) → Rs/R0 → PPM
//
// Rs comes from the voltage divider with load resistor RL:
//   Rs = ((Vcc - Vout) / Vout) * RL
//
// PPM comes from log-log power fit of the datasheet curves:
//   PPM = a * (Rs/R0)^b
//
// Coefficients (a, b) are fit from Hanwei Electronics datasheets:
//   MQ-2 (LPG-equivalent):   a=574.25,  b=-2.222   (Rs/R0 in clean air ≈ 9.83)
//   MQ-4 (CH4):              a=1012.7,  b=-2.786   (Rs/R0 in clean air ≈ 4.40)
//   MQ-8 (H2):               a=976.97,  b=-0.688   (Rs/R0 in clean air ≈ 70.0)
//
// R0 is calibrated per device in clean air and stored in devices.r0_*.

import type { SensorKind } from '../types.js';

export const MQ_COEFFS: Record<SensorKind, { a: number; b: number; cleanAirRatio: number }> = {
  mq2: { a: 574.25, b: -2.222, cleanAirRatio: 9.83 },
  mq4: { a: 1012.7, b: -2.786, cleanAirRatio: 4.4 },
  mq8: { a: 976.97, b: -0.688, cleanAirRatio: 70.0 },
};

export const ADC_MAX = 1023;

export function adcToVoltage(adc: number, vccMv: number): number {
  const clamped = Math.max(1, Math.min(ADC_MAX - 1, adc));
  return (clamped / ADC_MAX) * (vccMv / 1000);
}

export function voltageToRs(vout: number, vccMv: number, rlOhm: number): number {
  const vcc = vccMv / 1000;
  // Guard against division by zero when sensor pulls the line all the way low.
  const denom = Math.max(1e-4, vout);
  return ((vcc - vout) / denom) * rlOhm;
}

export function rsToPpm(rs: number, r0: number, kind: SensorKind): number {
  const { a, b } = MQ_COEFFS[kind];
  const ratio = Math.max(1e-4, rs / Math.max(1, r0));
  const ppm = a * Math.pow(ratio, b);
  return Number.isFinite(ppm) ? Math.max(0, ppm) : 0;
}

export interface CalibrationInput {
  adc: number;
  r0: number;
  vccMv: number;
  rlOhm: number;
  kind: SensorKind;
}

export function adcToPpm({ adc, r0, vccMv, rlOhm, kind }: CalibrationInput): number {
  const vout = adcToVoltage(adc, vccMv);
  const rs = voltageToRs(vout, vccMv, rlOhm);
  return rsToPpm(rs, r0, kind);
}

// Compute R0 from a batch of clean-air ADC readings. Used by the
// "sensor is in clean air, fix baseline" admin command.
export function calibrateR0(
  adcSamples: number[],
  vccMv: number,
  rlOhm: number,
  kind: SensorKind,
): number {
  if (adcSamples.length === 0) throw new Error('calibrateR0: no samples');
  const rsValues = adcSamples.map((adc) => voltageToRs(adcToVoltage(adc, vccMv), vccMv, rlOhm));
  const meanRs = rsValues.reduce((a, b) => a + b, 0) / rsValues.length;
  return meanRs / MQ_COEFFS[kind].cleanAirRatio;
}
