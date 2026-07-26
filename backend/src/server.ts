// Fastify bootstrap: schema init, first-run seed, route registration,
// mock generator loop and the periodic anomaly scan.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';

import { config } from './config.js';
import { getDb, closeDb } from './db/client.js';
import { listDevices, listDistricts } from './db/repositories.js';
import { ensureMq135Device, reconcileDeviceFlags, seedIfEmpty } from './db/seedData.js';
import { startMockLoop } from './mock/generator.js';
import { startTrafficPoller } from './external/tomtom.js';
import { loadSecretsFromEnv } from './auth/hmac.js';
import { scanAllDevices } from './services/anomalyScan.js';
import { startMq135MqttSubscriber, stopMq135MqttSubscriber } from './services/mq135Mqtt.js';
import { startReferenceCollector, stopReferenceCollector } from './services/referenceCollector.js';

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
import { airRoutes } from './routes/air.js';
import { mlRoutes } from './routes/ml.js';
import { stationRoutes } from './routes/stations.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { networkRoutes } from './routes/network.js';
import { accuracyRoutes } from './routes/accuracy.js';
import { trainModels } from './ml/service.js';

const ANOMALY_SCAN_INTERVAL_MS = 5 * 60_000;
const ANOMALY_SCAN_WINDOW_H = 3;
// The forecast model is cheap to fit (seconds) but its inputs only move hourly,
// so half-hourly retraining keeps it fresh without burning cycles.
const ML_RETRAIN_INTERVAL_MS = 30 * 60_000;

async function bootstrap(): Promise<void> {
  getDb();
  loadSecretsFromEnv();
  seedIfEmpty();
  // Outside seedIfEmpty: the real station must exist on every boot, including
  // on a database that already has the demo fleet in it.
  ensureMq135Device();
  reconcileDeviceFlags();

  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 32 * 1024,
  });

  // CORS_ORIGIN may be a comma-separated list of allowed origins.
  const origins = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, { origin: origins.length === 1 ? origins[0] : origins });
  await app.register(sensible);

  // Global rate limit (per IP). Device ingest is authenticated by HMAC and can
  // legitimately be high-frequency, so it opts out via its own config below.
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    allowList: (req) => req.url.startsWith('/api/ingest'),
  });

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
    airRoutes, mlRoutes, stationRoutes, dashboardRoutes, networkRoutes, accuracyRoutes,
  ]) {
    await app.register(routes);
  }
  if (config.useMock) await app.register(mockRoutes);

  await app.listen({ host: config.host, port: config.port });
  console.log(`AUA backend on http://${config.host}:${config.port}`);

  startTrafficPoller(app.log);
  startMq135MqttSubscriber(app.log);
  startReferenceCollector(app.log);

  if (config.useMock) {
    startMockLoop(config.mockIntervalMs);
    console.log(`[mock] generator started, interval ${config.mockIntervalMs}ms`);
  }

  // Fire-and-forget so a slow Open-Meteo response can't hold up the listen();
  // until it resolves /api/forecast/ml serves the Holt fallback.
  void trainModels().then((m) => {
    console.log(
      m
        ? `[ml] forecast model trained on ${m.train_rows} rows from ${m.stations} stations`
        : '[ml] forecast model unavailable, falling back to Holt blend',
    );
  });
  const retrainInterval = setInterval(() => void trainModels(), ML_RETRAIN_INTERVAL_MS);

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
    clearInterval(retrainInterval);
    stopReferenceCollector();
    await stopMq135MqttSubscriber();
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
