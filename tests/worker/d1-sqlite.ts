/**
 * Minimal D1-compatible wrapper over node:sqlite for production repository tests.
 */
import { openMemoryDb, type SqlDb } from './sqlite-harness';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

type Bound = {
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
  bind: (...params: unknown[]) => Bound;
};

function makeBound(db: SqlDb, sql: string, params: unknown[] = []): Bound {
  const bound: Bound = {
    async first<T = Record<string, unknown>>() {
      const row = db.prepare(sql).get(...params);
      return (row as T) ?? null;
    },
    async all<T = Record<string, unknown>>() {
      const results = db.prepare(sql).all(...params) as T[];
      return { results: results || [] };
    },
    async run() {
      db.prepare(sql).run(...params);
      return { meta: { changes: 1 } };
    },
    bind(...next: unknown[]) {
      return makeBound(db, sql, next);
    },
  };
  return bound;
}

function wrapPrepare(db: SqlDb, sql: string) {
  // D1 allows prepare().first() without bind when there are no placeholders
  return makeBound(db, sql, []);
}

export function createD1FromSqlite(db: SqlDb): D1Database {
  return {
    prepare(sql: string) {
      return wrapPrepare(db, sql) as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const stmt of statements) {
        // Our bound objects expose run via the D1 interface cast
        const r = await (stmt as unknown as Bound).run();
        results.push(r);
      }
      return results as unknown as D1Result[];
    },
    async exec(query: string) {
      db.exec(query);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}

export function applyMigrations(db: SqlDb) {
  const dir = join(__dirname, '../../migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    try {
      db.exec(sql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Skip JSON1 index failures on some sqlite builds
      if (!/json_extract|JSON/i.test(msg)) throw e;
    }
  }
}

export function openMigratedDb(): { db: SqlDb; d1: D1Database } {
  const db = openMemoryDb();
  applyMigrations(db);
  return { db, d1: createD1FromSqlite(db) };
}

export function mockEnv(d1: D1Database, overrides: Partial<import('../../worker/env').Env> = {}) {
  const r2Store = new Map<string, Uint8Array>();
  return {
    ASSETS: {} as Fetcher,
    DB: d1,
    IMAGES_BUCKET: {
      async put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob) {
        if (value instanceof Uint8Array) r2Store.set(key, value);
        else if (typeof value === 'string') r2Store.set(key, new TextEncoder().encode(value));
        else if (value instanceof ArrayBuffer) r2Store.set(key, new Uint8Array(value));
        return {} as R2Object;
      },
      async get(key: string) {
        const data = r2Store.get(key);
        if (!data) return null;
        return {
          body: data,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          writeHttpMetadata() {},
        } as unknown as R2ObjectBody;
      },
      async head(key: string) {
        return r2Store.has(key) ? ({} as R2Object) : null;
      },
      async delete(key: string) {
        r2Store.delete(key);
      },
    } as unknown as R2Bucket,
    CREATION_WORKFLOW: {
      async create() {
        return { id: 'wf' };
      },
    } as unknown as Workflow,
    GEMINI_API_KEY: 'test',
    FAMILY_ACCESS_CODE: 'family',
    SESSION_SIGNING_KEY: 'signing-key-for-tests-32chars!!',
    DAILY_CREDIT_LIMIT: '40',
    ...overrides,
  };
}
