import { describe, expect, it } from 'vitest';
import { CreationEngine } from '../../server/creation/engine';
import { FakeModelAdapter } from '../../server/creation/fake';
import {
  rateLimited,
  timeout,
  shouldChargeAttempt,
  shouldRetryAttempt,
} from '../../server/creation/errors';
import { MAX_PROVIDER_ATTEMPTS } from '../../shared/creation';

describe('attempt loop charge semantics', () => {
  it('invalid_input before adapter is not charged', async () => {
    const adapter = new FakeModelAdapter();
    const engine = new CreationEngine(adapter);
    try {
      await engine.run({ operation: 'coloring.generate', quality: 'draft', inputs: [] }, []);
    } catch (e) {
      expect(shouldChargeAttempt(e)).toBe(false);
      expect(adapter.calls).toBe(0);
    }
  });

  it('transient failure then success uses two calls and charges both when provider-touched', async () => {
    const adapter = new FakeModelAdapter({
      failWith: rateLimited('slow'),
      failTimes: 1,
    });
    const engine = new CreationEngine(adapter);
    let charges = 0;
    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
      try {
        await engine.run(
          { operation: 'coloring.generate', quality: 'draft', prompt: 'cat', inputs: [] },
          []
        );
        charges += 1;
        break;
      } catch (e) {
        if (shouldChargeAttempt(e)) charges += 1;
        if (!shouldRetryAttempt(e)) break;
      }
    }
    expect(adapter.calls).toBe(2);
    expect(charges).toBe(2);
  });

  it('ambiguous timeout does not auto-retry', async () => {
    const adapter = new FakeModelAdapter({
      failWith: timeout('deadline', true),
      failTimes: 5,
    });
    const engine = new CreationEngine(adapter);
    let attempts = 0;
    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
      attempts += 1;
      try {
        await engine.run(
          { operation: 'coloring.generate', quality: 'draft', prompt: 'cat', inputs: [] },
          []
        );
        break;
      } catch (e) {
        if (!shouldRetryAttempt(e)) break;
      }
    }
    expect(attempts).toBe(1);
    expect(adapter.calls).toBe(1);
  });
});
