import mqtt, { type MqttClient } from 'mqtt';
import { config } from '../config.js';
import { insertMq135AirReading } from '../db/repositories.js';
import type { Mq135AirReading } from '../types.js';

interface Logger {
  info: (o: unknown, m?: string) => void;
  warn: (o: unknown, m?: string) => void;
  error: (o: unknown, m?: string) => void;
}

let client: MqttClient | null = null;

export function startMq135MqttSubscriber(log?: Logger): MqttClient | null {
  if (!config.mqttEnabled || client) return client;

  client = mqtt.connect(config.mqttBrokerUrl, {
    clientId: `${config.mqttClientId}-${process.pid}`,
    clean: true,
    reconnectPeriod: 5_000,
    connectTimeout: 15_000,
  });

  client.on('connect', () => {
    client?.subscribe(config.mq135Topic, { qos: 0 }, (err) => {
      if (err) {
        log?.error({ err, topic: config.mq135Topic }, 'MQ-135 MQTT subscribe failed');
        return;
      }
      log?.info({ broker: config.mqttBrokerUrl, topic: config.mq135Topic }, 'MQ-135 MQTT subscriber started');
    });
  });

  client.on('message', (topic, payload) => {
    if (topic !== config.mq135Topic) return;
    try {
      const reading = parseMq135Message(topic, payload);
      const id = insertMq135AirReading(reading);
      log?.info({ id, topic, location: reading.location }, 'MQ-135 air reading saved');
    } catch (err) {
      log?.warn({ err, topic, payload: payload.toString('utf8').slice(0, 300) }, 'MQ-135 MQTT message rejected');
    }
  });

  client.on('error', (err) => {
    log?.error({ err }, 'MQ-135 MQTT client error');
  });

  return client;
}

export function stopMq135MqttSubscriber(): Promise<void> {
  return new Promise((resolve) => {
    if (!client) {
      resolve();
      return;
    }
    const c = client;
    client = null;
    c.end(false, {}, () => resolve());
  });
}

function parseMq135Message(topic: string, payload: Buffer): Mq135AirReading {
  let raw: unknown;
  try {
    raw = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new Error('invalid_json');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('payload_must_be_object');
  const obj = raw as Record<string, unknown>;

  const location = requireString(obj.location, 'location', 1, 160);
  const rawAdc = requireFiniteNumber(obj.raw_adc, 'raw_adc');
  const voltage = requireFiniteNumber(obj.voltage, 'voltage');
  const qualityPercent = requireFiniteNumber(obj.quality_percent, 'quality_percent');
  const status = requireString(obj.status, 'status', 1, 120);

  if (!Number.isInteger(rawAdc) || rawAdc < 0 || rawAdc > 1023) throw new Error('raw_adc_out_of_range');
  if (voltage < 0 || voltage > 5) throw new Error('voltage_out_of_range');
  if (qualityPercent < 0 || qualityPercent > 100) throw new Error('quality_percent_out_of_range');

  return {
    ts: new Date().toISOString(),
    topic,
    location,
    raw_adc: rawAdc,
    voltage: round(voltage, 3),
    quality_percent: round(qualityPercent, 2),
    status,
  };
}

function requireFiniteNumber(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name}_must_be_number`);
  return v;
}

function requireString(v: unknown, name: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new Error(`${name}_must_be_string`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new Error(`${name}_invalid_length`);
  return s;
}

function round(v: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}
