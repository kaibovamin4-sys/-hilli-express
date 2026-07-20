// Temperature / humidity compensation for MQ sensors.
//
// Datasheets show the Rs/R0 ratio varies materially with T and RH.
// We fit a simple curve to the averaged datasheet correction lines:
//   correction = c1 - c2*T + c3*T^2 - c4*(RH - 65)
// Corrected Rs = Rs / correction.
//
// When no DHT sensor is attached we skip compensation and mark quality_flag.

export interface CompensationInput {
  rs: number;
  tempC: number | null;
  humidity: number | null;
}

export interface CompensationResult {
  rs: number;
  applied: boolean;
}

const C = { c1: 1.35, c2: 0.019, c3: 0.00006, c4: 0.0035 };

export function compensateRs({ rs, tempC, humidity }: CompensationInput): CompensationResult {
  if (tempC == null || humidity == null) return { rs, applied: false };
  const t = Math.max(-30, Math.min(50, tempC));
  const rh = Math.max(0, Math.min(100, humidity));
  const factor = C.c1 - C.c2 * t + C.c3 * t * t - C.c4 * (rh - 65);
  const safe = Math.max(0.2, factor);
  return { rs: rs / safe, applied: true };
}
