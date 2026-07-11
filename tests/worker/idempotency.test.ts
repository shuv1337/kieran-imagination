import { describe, expect, it } from 'vitest';
import { stableRequestHash } from '../../shared/creation';
import { parseAndValidateCreationRequest } from '../../shared/validate';

describe('idempotency request hash', () => {
  it('same request same hash', () => {
    const a = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'standard',
      prompt: 'dragon',
      inputs: [],
      worldId: 'w1',
    });
    const b = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'standard',
      prompt: 'dragon',
      inputs: [],
      worldId: 'w1',
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(stableRequestHash(a.request)).toBe(stableRequestHash(b.request));
    }
  });

  it('different prompt different hash', () => {
    const a = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'standard',
      prompt: 'dragon',
      inputs: [],
    });
    const b = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'standard',
      prompt: 'unicorn',
      inputs: [],
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(stableRequestHash(a.request)).not.toBe(stableRequestHash(b.request));
    }
  });
});
