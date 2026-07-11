import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { openMemoryDb } from './sqlite-harness';

describe('migration apply smoke', () => {
  it('applies 0001-0007 on blank sqlite without error', () => {
    const dir = join(__dirname, '../../migrations');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files[0]).toMatch(/^0001/);
    expect(files).toContain('0006_trading_cards.sql');
    expect(files).toContain('0007_creation_platform.sql');

    const db = openMemoryDb();
    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8');
      // Strip only the known D1 json_extract index that some node:sqlite builds reject
      const cleaned = sql.replace(
        /CREATE INDEX[^;]*json_extract[^;]*;/gi,
        '-- skipped json_extract index for node:sqlite\n'
      );
      db.exec(cleaned);
    }

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('creation_jobs');
    expect(names).toContain('daily_budgets');
    expect(names).toContain('media_assets');
    expect(names).toContain('imagination_worlds');
    expect(names).toContain('card_documents');
    expect(names).toContain('trading_cards');
    expect(names).toContain('generated_images');
  });
});
