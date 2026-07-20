// SQLite via Node's built-in module (Node 22.5+ ships `node:sqlite`).
// No native compilation, no external service.
//
// If we later swap to Postgres+Timescale, only this file + repositories.ts
// change; the rest of the codebase talks to the repository layer.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DB = DatabaseSync;

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// Node's built-in prepared statements coerce SQLite types loosely.
// Booleans need to be integers for INSERT (`node:sqlite` throws on booleans).
export function bool01(v: boolean | number | null | undefined): number {
  return v ? 1 : 0;
}
