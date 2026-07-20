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

export const DEMO_DISTRICTS: DistrictRow[] = [
  { id: 'medeu', name: 'Медеу', lat: 43.161, lng: 77.058 },
  { id: 'almaly', name: 'Алмалы', lat: 43.256, lng: 76.929 },
  { id: 'alatau', name: 'Алатау', lat: 43.216, lng: 76.844 },
  { id: 'turksib', name: 'Турксиб', lat: 43.339, lng: 76.985 },
  { id: 'bostandyk', name: 'Бостандык', lat: 43.222, lng: 76.919 },
  { id: 'auezov', name: 'Ауэзов', lat: 43.238, lng: 76.855 },
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
