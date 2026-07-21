// Admin guard for privileged endpoints (device calibration, mock controls).
//
// Auth model: a single shared bearer token from ADMIN_TOKEN. Compared in
// constant time. If ADMIN_TOKEN is unset the guard FAILS CLOSED (401) rather
// than silently allowing everything — a missing secret must never mean "open".

import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

function constantEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Fastify preHandler. Requires `Authorization: Bearer <ADMIN_TOKEN>`.
 * Usage:  app.post('/api/...', { preHandler: requireAdmin, schema }, handler)
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    req.log.error('ADMIN_TOKEN is not set — refusing privileged request');
    return reply.code(401).send({ error: 'admin_auth_not_configured' });
  }
  const header = req.headers['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing_bearer_token' });
  }
  const token = header.slice('Bearer '.length).trim();
  if (!constantEquals(token, expected)) {
    return reply.code(401).send({ error: 'invalid_admin_token' });
  }
}
