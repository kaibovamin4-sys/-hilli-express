// Background collector for the accuracy archive.
//
// Every half hour it stores the outside world's PM2.5 next to ours. Two things
// come out of that over time: a continuous check that our network agrees with
// the reference in the same hour and the same place, and a growing record from
// which the conversion of our composite index into the familiar PM2.5 scale can
// actually be fitted. Neither is possible from live values alone — both need
// the history, which is why this writes to a table instead of being computed on
// request.

import { config } from '../config.js';
import { insertReferenceBatch, listDevices } from '../db/repositories.js';
import { fetchReference } from '../external/reference.js';

interface Logger {
  info: (o: unknown, m?: string) => void;
  warn: (o: unknown, m?: string) => void;
}

let timer: NodeJS.Timeout | null = null;

export async function collectReferenceOnce(log?: Logger): Promise<number> {
  const devices = listDevices(true);
  // Sample at our own stations: the comparison is only meaningful where we
  // actually have something to compare against.
  const points = devices.map((d) => ({ lat: d.lat, lng: d.lng }));
  if (points.length === 0) return 0;

  const centre = { lat: config.cityLat, lng: config.cityLng };
  const { samples, source, degraded } = await fetchReference(points, centre);
  const inserted = insertReferenceBatch(samples);
  if (inserted > 0) {
    log?.info({ inserted, source, degraded }, 'reference PM2.5 archived');
  }
  return inserted;
}

export function startReferenceCollector(log?: Logger): void {
  if (timer) return;
  const tick = () => {
    void collectReferenceOnce(log).catch((err) => log?.warn({ err }, 'reference collection failed'));
  };
  tick();
  timer = setInterval(tick, config.referenceRefreshMs);
}

export function stopReferenceCollector(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
