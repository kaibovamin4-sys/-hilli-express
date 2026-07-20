import { createHmac, timingSafeEqual } from 'node:crypto';

// Simple in-memory secret store keyed by device id.
// Rotated at bootstrap from ENV (DEVICE_SECRETS='id1:secret1,id2:secret2') and
// from `devices.api_key_hash` when we later add proper key management.
const secrets = new Map<string, string>();

export function setSecret(deviceId: string, secret: string): void {
  secrets.set(deviceId, secret);
}

export function loadSecretsFromEnv(): void {
  const raw = process.env.DEVICE_SECRETS;
  if (!raw) return;
  for (const pair of raw.split(',')) {
    const [id, secret] = pair.split(':');
    if (id && secret) secrets.set(id.trim(), secret.trim());
  }
}

export function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verify(deviceId: string, body: string, signatureHex: string): boolean {
  const secret = secrets.get(deviceId);
  if (!secret) return false;
  const expected = sign(secret, body);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
