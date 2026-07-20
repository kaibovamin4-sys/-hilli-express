# AUA Backend

Bespoke backend for the AUA air-monitoring site. Ingests ESP8266 readings
(MQ2/MQ4/MQ8), merges them with Open-Meteo weather / air-quality / pollen,
computes composite indexes, detects anomalies, and produces recommendations
tailored to a user profile.

## Stack

- **Node 22.5+**, **TypeScript**, **Fastify**
- **node:sqlite** (built-in SQLite; swap-in point for Postgres+Timescale later)
- **undici** for outbound HTTP (Open-Meteo)
- No external services or API keys required — one command, all runs locally.

## Run

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:8080
```

On first run the DB is created and seeded with 6 demo devices and 3 days
of mock history. The mock generator then emits new readings every 30 s.

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | liveness + counts |
| GET  | `/api/status?lat=&lng=&profile=` | full state + recommendations for a point |
| GET  | `/api/recommendations?lat=&lng=&profile=` | recommendations only |
| GET  | `/api/forecast?lat=&lng=` | Open-Meteo weather + air + pollen |
| GET  | `/api/forecast/aqi?device_id=&hours=` | 6h AQI forecast (Holt + Open-Meteo blend) |
| GET  | `/api/readings/latest` | last processed reading per device |
| GET  | `/api/readings/history?device_id=&from=&to=` | time-series |
| GET  | `/api/coverage?size_km=&step_km=` | IDW grid for heatmap |
| GET  | `/api/fusion?lat=&lng=` | background + Gaussian MQ-correction estimate |
| GET  | `/api/devices` | list of stations (public fields) |
| GET  | `/api/districts` | seed districts |
| GET  | `/api/anomalies?since=` | recent detected events |
| GET  | `/api/classify/:device_id` | event fingerprint: fire / gas leak / traffic / smog |
| GET  | `/api/compare-districts` | ranking "where to walk today" |
| GET  | `/api/cigarettes?hours=` | PM2.5 exposure as cigarettes (Berkeley Earth) |
| GET  | `/api/ventilation?lat=&lng=` | best windows to air the apartment |
| GET  | `/api/sensor-health[/:device_id]` | fleet trust score (uptime/agreement/drift) |
| GET  | `/api/traffic?lat=&lng=` | congestion index (model, provider-ready) |
| GET  | `/api/construction?lat=&lng=` | construction dust zones (demo layer) |
| GET  | `/api/optimize-placement?stations=` | greedy set-cover station planner |
| POST | `/api/chat` | rule-based eco assistant on live data |
| POST | `/api/route-exposure` | dose integral along a walking route |
| POST | `/api/ingest` | ESP8266 push (HMAC-signed) |
| POST | `/api/devices/:id/calibrate` | recompute R0 from recent raw readings |
| POST | `/api/anomalies/scan` | trigger anomaly detection |
| POST | `/api/mock/inject-anomaly` | force a demo event (mock only) |
| POST | `/api/mock/reseed` | wipe & re-seed mock history |

Profiles: `default | infant | child | asthma | allergy | elderly | athlete | pregnant`.

## ESP8266 protocol

`POST /api/ingest` with headers `X-Device-Id` and `X-Signature` (HMAC-SHA256 of
raw JSON body, key stored in `DEVICE_SECRETS` env as `id1:secret1,id2:secret2`).
Body: `{ ts, mq2_adc, mq4_adc, mq8_adc, temp_c?, humidity?, vcc_mv? }`.

## Data pipeline

1. Raw ADC → voltage → `Rs` (voltage divider with `RL`).
2. Temperature/humidity compensation (`compensation.ts`).
3. `Rs/R0` → PPM via power-law from Hanwei datasheets (`calibration.ts`).
4. PPM per gas → sub-index → **composite AQI = max(sub_i)** (`aqi.ts`).
5. Local composite + Open-Meteo PM2.5 → `status` level (`status.ts`).
6. Rolling-window z-score → anomaly events (`anomalies.ts`).
7. IDW between posts → estimate at any point (`idw.ts`).
8. Rule engine → user-facing recommendations (`recommendations/engine.ts`).
9. Hour-by-hour scoring → best walk window (`recommendations/timing.ts`).

## Roadmap (not yet built)

- Postgres+TimescaleDB swap (data layer already abstracted).
- Telegram bot for pushed alerts.
- SSE endpoint `/api/stream` for live updates.
- Personal exposure diary (accumulated dose per user).
