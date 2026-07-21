// Live traffic layer backed by TomTom Traffic Flow.
//
// The rest of the app calls congestionAt() synchronously in many places, so we
// can't fetch on demand. Instead a background poller refreshes each corridor's
// live speed every TRAFFIC_REFRESH_MS and stores a 0..1 load figure in memory;
// synchronous callers read the latest snapshot. If TOMTOM_KEY is unset or a
// request fails, the corridor keeps its synthetic base load and the traffic
// module transparently falls back to the model.
//
// TomTom Traffic Flow (flowSegmentData) returns currentSpeed and freeFlowSpeed
// for the road nearest a point. load = 1 - currentSpeed/freeFlowSpeed, clamped
// to 0..1 — 0 means flowing at free-flow speed, 1 means fully stopped.

import { config } from '../config.js';
import { CORRIDORS, type Corridor } from './traffic.js';

interface LiveLoad {
  load: number; // 0..1, live congestion for this corridor
  at: number; // epoch ms of the reading
}

const liveLoads = new Map<string, LiveLoad>();
let started = false;

export function hasLiveTraffic(): boolean {
  return config.tomtomKey !== '' && liveLoads.size > 0;
}

// Latest live load for a corridor, or null if we have no fresh reading for it.
export function liveLoadFor(corridorId: string): number | null {
  const hit = liveLoads.get(corridorId);
  if (!hit) return null;
  // Treat readings older than 3 refresh cycles as stale.
  if (Date.now() - hit.at > config.trafficRefreshMs * 3) return null;
  return hit.load;
}

// Sample point for a corridor: its middle anchor, most representative of the road.
function samplePoint(c: Corridor) {
  return c.path[Math.floor(c.path.length / 2)] ?? c.path[0]!;
}

async function fetchCorridorLoad(c: Corridor): Promise<number | null> {
  const p = samplePoint(c);
  const url =
    'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json' +
    `?point=${p.lat},${p.lng}&unit=KMPH&key=${encodeURIComponent(config.tomtomKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom ${res.status}`);
  const data = (await res.json()) as {
    flowSegmentData?: { currentSpeed?: number; freeFlowSpeed?: number };
  };
  const seg = data.flowSegmentData;
  if (!seg || !seg.freeFlowSpeed || seg.currentSpeed == null) return null;
  const ratio = seg.currentSpeed / seg.freeFlowSpeed;
  return Math.max(0, Math.min(1, 1 - ratio));
}

async function refreshAll(): Promise<void> {
  const results = await Promise.allSettled(CORRIDORS.map((c) => fetchCorridorLoad(c)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value != null) {
      liveLoads.set(CORRIDORS[i]!.id, { load: r.value, at: Date.now() });
    }
  });
}

// Starts the background poller once. Safe to call on boot; no-op without a key.
export function startTrafficPoller(log?: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void }): void {
  if (started || !config.tomtomKey) return;
  started = true;
  const tick = () => {
    refreshAll().catch((err) => log?.error({ err }, 'traffic poll failed'));
  };
  tick();
  setInterval(tick, config.trafficRefreshMs).unref();
  log?.info({ corridors: CORRIDORS.length, everyMs: config.trafficRefreshMs }, 'TomTom traffic poller started');
}
