// Raw → processed pipeline, shared by the real ingest route, the MQ-135 MQTT
// subscriber and the mock generator:
//   ADC → Rs → T/RH compensation → PPM → composite AQI → status.
//
// Which channels get computed follows the device, not the caller: an MQ-135
// station produces one gas value and leaves the trio NULL, and vice versa. The
// composite then scores whatever is actually present, so a single-element
// station is never diluted by three absent channels reading zero.

import type { Device, RawReading, ProcessedReading, SensorKind } from '../types.js';
import { adcToVoltage, voltageToRs, rsToPpm } from './calibration.js';
import { compensateRs } from './compensation.js';
import { computeAqi } from './aqi.js';
import { statusFor } from './status.js';

export function processReading(device: Device, raw: RawReading): ProcessedReading {
  const ppm = (kind: SensorKind, adc: number | null, r0: number): number | null => {
    if (adc == null) return null;
    const vout = adcToVoltage(adc, device.vcc_mv);
    const rs = voltageToRs(vout, device.vcc_mv, device.rl_ohm);
    const comp = compensateRs({ rs, tempC: raw.temp_c, humidity: raw.humidity });
    return round2(rsToPpm(comp.rs, r0, kind));
  };

  const mq2_ppm = ppm('mq2', raw.mq2_adc, device.r0_mq2);
  const mq4_ppm = ppm('mq4', raw.mq4_adc, device.r0_mq4);
  const mq8_ppm = ppm('mq8', raw.mq8_adc, device.r0_mq8);
  const mq135_ppm = ppm('mq135', raw.mq135_adc, device.r0_mq135);

  const aqi = computeAqi({ mq2_ppm, mq4_ppm, mq8_ppm, mq135_ppm });
  const status = statusFor({ aqiComposite: aqi.aqi, pm25External: null });

  return {
    device_id: device.id,
    ts: raw.ts,
    mq2_ppm,
    mq4_ppm,
    mq8_ppm,
    mq135_ppm,
    aqi_composite: aqi.aqi,
    status: status.level,
    quality_flag: qualityFlag(aqi.dominant, raw),
  };
}

function qualityFlag(dominant: SensorKind | null, raw: RawReading): ProcessedReading['quality_flag'] {
  // No usable gas channel at all — the packet arrived but says nothing.
  if (dominant === null) return 'sensor_error';
  // Without temperature and humidity the Rs curve runs uncompensated, which
  // matters most in Almaty's winter; flagging it keeps that visible downstream.
  return raw.temp_c != null && raw.humidity != null ? 'ok' : 'no_compensation';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
