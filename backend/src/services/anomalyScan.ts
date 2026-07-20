// Anomaly scan over every active device — shared by the periodic server
// job and the manual POST /api/anomalies/scan trigger.

import { listDevices, processedRange, insertAnomaly } from '../db/repositories.js';
import { detectAnomalies } from '../processing/anomalies.js';

export interface ScanResult {
  device_id: string;
  found: number;
}

export function scanAllDevices(hours: number): ScanResult[] {
  const from = new Date(Date.now() - hours * 3_600_000).toISOString();
  const to = new Date().toISOString();
  const results: ScanResult[] = [];
  for (const d of listDevices(true)) {
    const events = detectAnomalies(d.id, processedRange(d.id, from, to));
    for (const e of events) insertAnomaly(e);
    results.push({ device_id: d.id, found: events.length });
  }
  return results;
}
