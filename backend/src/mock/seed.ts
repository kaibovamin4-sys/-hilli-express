// One-shot seed: demo devices + districts + N days of history.
// Run: `npm run seed`

import { config } from '../config.js';
import { listDevices } from '../db/repositories.js';
import { seedDevicesAndDistricts, DEMO_DISTRICTS } from '../db/seedData.js';
import { seedHistory } from './generator.js';

seedDevicesAndDistricts();
console.log(`Seeded ${listDevices(true).length} devices, ${DEMO_DISTRICTS.length} districts`);

const result = seedHistory(config.mockSeedDays);
console.log(
  `Seeded ${config.mockSeedDays} days of history: ` +
  `${result.insertedRaw} raw / ${result.insertedProc} processed readings`,
);
