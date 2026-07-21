// Fastify bootstrap: schema init, first-run seed, route registration,
// mock generator loop and the periodic anomaly scan.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

import { config } from './config.js';
import { getDb, closeDb } from './db/client.js';
import { listDevices, listDistricts } from './db/repositories.js';
import { seedIfEmpty } from './db/seedData.js';
import { startMockLoop } from './mock/generator.js';
import { loadSecretsFromEnv } from './auth/hmac.js';
import { scanAllDevices } from './services/anomalyScan.js';

import { statusRoutes } from './routes/status.js';
import { ingestRoutes } from './routes/ingest.js';
import { readingsRoutes } from './routes/readings.js';
import { deviceRoutes } from './routes/devices.js';
import { coverageRoutes } from './routes/coverage.js';
import { forecastRoutes } from './routes/forecast.js';
import { anomaliesRoutes } from './routes/anomalies.js';
import { mockRoutes } from './routes/mock.js';
import { recommendationsRoutes } from './routes/recommendations.js';
import { compareRoutes } from './routes/compare.js';
import { analyticsRoutes } from './routes/analytics.js';
import { cityRoutes } from './routes/city.js';
import { chatRoutes } from './routes/chat.js';
import { placesRoutes } from './routes/places.js';

const ANOMALY_SCAN_INTERVAL_MS = 5 * 60_000;
const ANOMALY_SCAN_WINDOW_H = 3;

async function bootstrap(): Promise<void> {
  getDb();
  loadSecretsFromEnv();
  seedIfEmpty();

  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 32 * 1024,
  });

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(sensible);

  app.get('/api/health', async () => ({
    ok: true,
    ts: new Date().toISOString(),
    devices: listDevices(true).length,
    districts: listDistricts().length,
    mock: config.useMock,
  }));

  for (const routes of [
    statusRoutes, ingestRoutes, readingsRoutes, deviceRoutes, coverageRoutes,
    forecastRoutes, anomaliesRoutes, recommendationsRoutes, compareRoutes,
    analyticsRoutes, cityRoutes, chatRoutes, placesRoutes,
  ]) {
    await app.register(routes);
  }
  if (config.useMock) await app.register(mockRoutes);

  await app.listen({ host: config.host, port: config.port });
  console.log(`AUA backend on http://${config.host}:${config.port}`);

  if (config.useMock) {
    startMockLoop(config.mockIntervalMs);
    console.log(`[mock] generator started, interval ${config.mockIntervalMs}ms`);
  }

  const scanInterval = setInterval(() => {
    try {
      const total = scanAllDevices(ANOMALY_SCAN_WINDOW_H).reduce((s, r) => s + r.found, 0);
      if (total > 0) console.log(`[anomalies] wrote ${total} events`);
    } catch (e) {
      console.error('[anomalies] scan failed', e);
    }
  }, ANOMALY_SCAN_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(scanInterval);
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
