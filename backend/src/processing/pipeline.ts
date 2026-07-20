// Raw → processed pipeline, shared by the real ingest route and the mock
// generator: ADC → Rs → T/RH compensation → PPM → composite AQI → status.

import type { Device, RawReading, ProcessedReading, SensorKind } from '../types.js';
import { adcToVoltage, voltageToRs, rsToPpm } from './calibration.js';
import { compensateRs } from './compensation.js';
import { computeAqi } from './aqi.js';
import { statusFor } from './status.js';

export function processReading(device: Device, raw: RawReading): ProcessedReading {
  const ppm = (kind: SensorKind, adc: number, r0: number): number => {
    const vout = adcToVoltage(adc, device.vcc_mv);
    const rs = voltageToRs(vout, device.vcc_mv, device.rl_ohm);
    const comp = compensateRs({ rs, tempC: raw.temp_c, humidity: raw.humidity });
    return rsToPpm(comp.rs, r0, kind);
  };

  const mq2_ppm = ppm('mq2', raw.mq2_adc, device.r0_mq2);
  const mq4_ppm = ppm('mq4', raw.mq4_adc, device.r0_mq4);
  const mq8_ppm = ppm('mq8', raw.mq8_adc, device.r0_mq8);
  const aqi = computeAqi({ mq2_ppm, mq4_ppm, mq8_ppm });
  const status = statusFor({ aqiComposite: aqi.aqi, pm25External: null });

  return {
    device_id: device.id,
    ts: raw.ts,
    mq2_ppm: round2(mq2_ppm),
    mq4_ppm: round2(mq4_ppm),
    mq8_ppm: round2(mq8_ppm),
    aqi_composite: aqi.aqi,
    status: status.level,
    quality_flag: raw.temp_c != null && raw.humidity != null ? 'ok' : 'no_compensation',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
