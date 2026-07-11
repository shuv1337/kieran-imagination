import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// node:sqlite is available on Node 22+; load via createRequire so Vitest resolves it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path?: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
  };
};

export type SqlDb = InstanceType<typeof DatabaseSync>;

export function openMemoryDb(): SqlDb {
  return new DatabaseSync(':memory:');
}
