import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { openMemoryDb } from './sqlite-harness';

/**
 * Load trigger definitions from production migration 0007 (not a hand copy).
 */
function loadTriggersFromMigration(): string {
  const sql = readFileSync(
    join(__dirname, '../../migrations/0007_creation_platform.sql'),
    'utf8'
  );
  // Split on CREATE TRIGGER and rejoin complete statements ending with END;
  const parts = sql.split(/(?=CREATE TRIGGER)/i).filter((p) => /CREATE TRIGGER/i.test(p));
  // Each part may include trailing table DDL noise — take until last END; of trigger body
  const triggers: string[] = [];
  for (const part of parts) {
    const m = part.match(/CREATE TRIGGER[\s\S]*?\nEND;/i);
    if (m) triggers.push(m[0]);
  }
  if (triggers.length < 3) {
    throw new Error(`Expected budget triggers in 0007, found ${triggers.length}`);
  }
  return triggers.join('\n');
}

function setupDb() {
  const db = openMemoryDb();
  db.exec(`
    CREATE TABLE daily_budgets (
      owner_id TEXT NOT NULL,
      day TEXT NOT NULL,
      credit_limit INTEGER NOT NULL,
      reserved INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner_id, day)
    );
    CREATE TABLE creation_jobs (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      operation TEXT NOT NULL,
      quality TEXT NOT NULL,
      request_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT NOT NULL DEFAULT 'input',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      reserved_credits INTEGER NOT NULL DEFAULT 0,
      charged_credits INTEGER NOT NULL DEFAULT 0,
      budget_state TEXT NOT NULL DEFAULT 'reserved',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (owner_id, idempotency_key)
    );
  `);
  db.exec(loadTriggersFromMigration());
  return db;
}

describe('daily credit D1 triggers from migration 0007', () => {
  it('aborts when budget row missing', () => {
    const db = setupDb();
    const now = Date.now();
    expect(() => {
      db.prepare(
        `INSERT INTO creation_jobs
         (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
          reserved_credits, budget_state, created_at, updated_at)
         VALUES ('j1', 'household', 'k1', 'h', 'coloring.generate', 'standard', '{}', 4, 'reserved', ?, ?)`
      ).run(now, now);
    }).toThrow(/budget_missing|ABORT/i);
  });

  it('reserves and rejects over-limit concurrent inserts', () => {
    const db = setupDb();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO daily_budgets (owner_id, day, credit_limit, reserved, used) VALUES ('household', ?, 8, 0, 0)`
    ).run(day);

    const insert = (id: string, key: string) => {
      db.prepare(
        `INSERT INTO creation_jobs
         (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
          reserved_credits, budget_state, created_at, updated_at)
         VALUES (?, 'household', ?, 'h', 'coloring.generate', 'standard', '{}', 4, 'reserved', ?, ?)`
      ).run(id, key, now, now);
    };

    insert('j1', 'k1');
    insert('j2', 'k2');
    expect(() => insert('j3', 'k3')).toThrow(/budget_exceeded|ABORT/i);

    const budget = db
      .prepare(`SELECT reserved, used FROM daily_budgets WHERE owner_id='household' AND day=?`)
      .get(day) as { reserved: number; used: number };
    expect(budget.reserved).toBe(8);
    expect(budget.used).toBe(0);
  });

  it('settle moves reserved to used once', () => {
    const db = setupDb();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO daily_budgets (owner_id, day, credit_limit, reserved, used) VALUES ('household', ?, 40, 0, 0)`
    ).run(day);
    db.prepare(
      `INSERT INTO creation_jobs
       (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
        reserved_credits, charged_credits, budget_state, created_at, updated_at)
       VALUES ('j1', 'household', 'k1', 'h', 'coloring.generate', 'standard', '{}', 4, 0, 'reserved', ?, ?)`
    ).run(now, now);

    db.prepare(
      `UPDATE creation_jobs SET budget_state='settled', charged_credits=2 WHERE id='j1'`
    ).run();

    const budget = db
      .prepare(`SELECT reserved, used FROM daily_budgets WHERE owner_id='household' AND day=?`)
      .get(day) as { reserved: number; used: number };
    expect(budget.reserved).toBe(0);
    expect(budget.used).toBe(2);
  });

  it('released clears reserved without charging used', () => {
    const db = setupDb();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO daily_budgets (owner_id, day, credit_limit, reserved, used) VALUES ('household', ?, 40, 0, 0)`
    ).run(day);
    db.prepare(
      `INSERT INTO creation_jobs
       (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
        reserved_credits, charged_credits, budget_state, created_at, updated_at)
       VALUES ('j-rel', 'household', 'k-rel', 'h', 'coloring.generate', 'standard', '{}', 4, 0, 'reserved', ?, ?)`
    ).run(now, now);

    const afterReserve = db
      .prepare(`SELECT reserved, used FROM daily_budgets WHERE owner_id='household' AND day=?`)
      .get(day) as { reserved: number; used: number };
    expect(afterReserve.reserved).toBe(4);

    db.prepare(
      `UPDATE creation_jobs SET budget_state='released', charged_credits=0 WHERE id='j-rel'`
    ).run();

    const afterRelease = db
      .prepare(`SELECT reserved, used FROM daily_budgets WHERE owner_id='household' AND day=?`)
      .get(day) as { reserved: number; used: number };
    expect(afterRelease.reserved).toBe(0);
    expect(afterRelease.used).toBe(0);
  });
});
