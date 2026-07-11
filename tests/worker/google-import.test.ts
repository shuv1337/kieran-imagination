import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) files.push(p);
  }
  return files;
}

describe('single Google SDK import', () => {
  it('only server/creation/google.ts imports @google/genai', () => {
    const root = join(__dirname, '../..');
    const files = walk(root);
    const importers: string[] = [];
    for (const file of files) {
      if (file.includes('/tests/') || file.includes('/node_modules/')) continue;
      const text = readFileSync(file, 'utf8');
      if (/from ['"]@google\/genai['"]/.test(text) || /require\(['"]@google\/genai['"]\)/.test(text)) {
        importers.push(file.replace(root + '/', ''));
      }
    }
    expect(importers).toEqual(['server/creation/google.ts']);
  });
});
