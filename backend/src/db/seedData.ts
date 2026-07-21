// Demo fleet + districts, shared by server bootstrap and the standalone
// `npm run seed` script. Single source of truth for first-run data.

import { config } from '../config.js';
import { listDevices, upsertDevice, upsertDistrict, type DistrictRow } from './repositories.js';
import { seedHistory } from '../mock/generator.js';

export const DEMO_DEVICES = [
  { id: 'aua-medeu-1', name: 'Медеу-1', lat: 43.161, lng: 77.058, district: 'Медеу (парк)' },
  { id: 'aua-almaly-1', name: 'Алмалы-1', lat: 43.256, lng: 76.929, district: 'Алмалы (центр)' },
  { id: 'aua-alatau-1', name: 'Алатау-1', lat: 43.216, lng: 76.844, district: 'Алатау (жилой)' },
  { id: 'aua-turksib-1', name: 'Турксиб-1', lat: 43.339, lng: 76.985, district: 'Турксиб (промышленный)' },
  { id: 'aua-bostandyk-1', name: 'Бостандык-1', lat: 43.222, lng: 76.919, district: 'Бостандык (жилой)' },
  { id: 'aua-auezov-1', name: 'Ауэзов-1', lat: 43.238, lng: 76.855, district: 'Ауэзов (жилой)' },
];

// District centers are the area-weighted centroid of each district's official
// boundary polygon (see frontend /public/almaty-districts.geojson, sourced from
// OSM administrative boundary relations) — not eyeballed coordinates. Used as
// the reference point for /api/compare-districts and as dropdown/geolocation
// targets on the frontend.
export const DEMO_DISTRICTS: DistrictRow[] = [
  { id: 'alatau', name: 'Алатауский', lat: 43.298736, lng: 76.834789 },
  { id: 'almaly', name: 'Алмалинский', lat: 43.252231, lng: 76.908795 },
  { id: 'auezov', name: 'Ауэзовский', lat: 43.223746, lng: 76.8505 },
  { id: 'bostandyk', name: 'Бостандыкский', lat: 43.155728, lng: 76.923471 },
  { id: 'medeu', name: 'Медеуский', lat: 43.159875, lng: 77.018629 },
  { id: 'nauryzbay', name: 'Наурызбайский', lat: 43.174418, lng: 76.830941 },
  { id: 'turksib', name: 'Турксибский', lat: 43.340927, lng: 76.985681 },
  { id: 'zhetysu', name: 'Жетысуский', lat: 43.308927, lng: 76.924772 },
];

export function seedDevicesAndDistricts(): void {
  const now = new Date().toISOString();
  for (const d of DEMO_DEVICES) {
    upsertDevice({
      ...d,
      r0_mq2: 10000, r0_mq4: 10000, r0_mq8: 10000,
      vcc_mv: 3300, rl_ohm: 10000,
      firmware: 'mock-1.0',
      installed_at: now, last_seen_at: null, active: 1,
    });
  }
  for (const d of DEMO_DISTRICTS) upsertDistrict(d);
}

// First run only: empty DB → demo fleet (+ history in mock mode).
export function seedIfEmpty(): void {
  if (listDevices(false).length > 0) return;
  seedDevicesAndDistricts();
  if (config.useMock) {
    const r = seedHistory(config.mockSeedDays);
    console.log(`[seed] ${r.insertedProc} history readings across ${DEMO_DEVICES.length} devices`);
  }
}
