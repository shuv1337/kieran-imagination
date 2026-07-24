import { describe, expect, it } from 'vitest';
import { CreationEngine } from '../../server/creation/engine';
import { FakeModelAdapter } from '../../server/creation/fake';
import { CreationError, filtered, rateLimited, providerUnavailable, timeout, noOutput } from '../../server/creation/errors';
import { mapGoogleError } from '../../server/creation/google';
import { CREATION_OPERATIONS, creditsForRequest, maxReservedCredits, stableRequestHash } from '../../shared/creation';
import { allStableModelIds, getModelForQuality } from '../../server/creation/models';
import { profileForOperation } from '../../server/creation/profiles';

describe('CreationEngine contracts', () => {
  for (const operation of CREATION_OPERATIONS) {
    it(`accepts operation ${operation}`, async () => {
      const isText = operation.startsWith('prompt') || operation.startsWith('suggestions') || operation.startsWith('card-copy');
      const adapter = new FakeModelAdapter({
        objectResult: isText
          ? operation === 'prompt.improve'
            ? { improvedPrompt: 'better' }
            : operation === 'suggestions.generate'
              ? { suggestions: ['🦄 A unicorn'] }
              : { moves: [{ id: '1', name: 'Zap', description: 'Zap!' }], flavorText: 'Wow' }
          : undefined,
      });
      const engine = new CreationEngine(adapter);
      const profile = profileForOperation(operation);

      const request = {
        operation,
        quality: 'standard' as const,
        prompt: profile.requiresPrompt ? 'a friendly dragon' : undefined,
        instruction: profile.requiresInstruction ? 'add stars' : undefined,
        inputs: profile.requiresBaseInput
          ? [{ assetId: 'asset-1', role: 'base' as const, position: 0 }]
          : [],
      };

      const result = await engine.run(request, profile.requiresBaseInput
        ? [{ assetId: 'asset-1', role: 'base', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }]
        : []);

      if (isText) {
        expect(result.kind).toBe('text');
      } else {
        expect(result.kind).toBe('image');
        expect((result as { bytes: Uint8Array }).bytes.length).toBeGreaterThan(0);
      }
      expect(adapter.calls).toBe(1);
    });
  }

  it('rejects missing prompt for generate', async () => {
    const engine = new CreationEngine(new FakeModelAdapter());
    await expect(
      engine.run({ operation: 'coloring.generate', quality: 'draft', inputs: [] }, [])
    ).rejects.toMatchObject({ category: 'invalid_input' });
  });
});

describe('credits and idempotency hash', () => {
  it('computes fixed credits', () => {
    expect(creditsForRequest({ operation: 'prompt.improve', quality: 'draft' })).toBe(1);
    expect(creditsForRequest({ operation: 'coloring.generate', quality: 'standard' })).toBe(1);
    expect(creditsForRequest({ operation: 'coloring.generate', quality: 'print' })).toBe(1);
    expect(maxReservedCredits({ operation: 'coloring.generate', quality: 'standard' })).toBe(2);
  });

  it('stable hash ignores input order', () => {
    const a = stableRequestHash({
      operation: 'coloring.edit',
      quality: 'standard',
      instruction: 'x',
      inputs: [
        { assetId: 'b', role: 'base', position: 1 },
        { assetId: 'a', role: 'character', position: 0 },
      ],
    });
    const b = stableRequestHash({
      operation: 'coloring.edit',
      quality: 'standard',
      instruction: 'x',
      inputs: [
        { assetId: 'a', role: 'character', position: 0 },
        { assetId: 'b', role: 'base', position: 1 },
      ],
    });
    expect(a).toBe(b);
  });
});

describe('model catalog', () => {
  it('uses only stable model ids (no preview/retired)', () => {
    const ids = allStableModelIds();
    for (const id of ids) {
      expect(id).not.toMatch(/preview/i);
      expect(id).not.toMatch(/gemini-2\.0/);
    }
    expect(ids).toContain('gemini-3.1-flash-lite-image');
    expect(ids).toContain('gemini-3.1-flash-lite');
  });

  it('routes every production image quality to Flash Lite 1K', () => {
    for (const quality of ['draft', 'standard', 'print', 'premium'] as const) {
      expect(getModelForQuality(quality)).toMatchObject({
        modelId: 'gemini-3.1-flash-lite-image',
        imageSize: '1K',
      });
    }
  });
});

describe('Google adapter error mapping', () => {
  it('maps 429', () => {
    const err = mapGoogleError(Object.assign(new Error('rate limited'), { status: 429 }));
    expect(err.category).toBe('rate_limited');
    expect(err.retryable).toBe(true);
    expect(err.providerTouched).toBe(true);
  });

  it('maps 5xx', () => {
    const err = mapGoogleError(Object.assign(new Error('boom'), { status: 503 }));
    expect(err.category).toBe('provider_unavailable');
  });

  it('maps timeout as ambiguous (not auto-retryable)', () => {
    const err = mapGoogleError(new Error('deadline exceeded timeout'));
    expect(err.category).toBe('timeout');
    expect(err.retryable).toBe(false);
  });

  it('maps safety filter', () => {
    const err = mapGoogleError(new Error('SAFETY blocked'));
    expect(err.category).toBe('filtered');
  });

  it('maps pre-response network as not provider-touched', () => {
    const err = mapGoogleError(new Error('fetch failed'));
    expect(err.category).toBe('provider_unavailable');
    expect(err.providerTouched).toBe(false);
  });

  it('preserves CreationError', () => {
    const e = filtered('nope');
    expect(mapGoogleError(e)).toBe(e);
  });
});

describe('retry policy helpers', () => {
  it('definite transient failures are retryable', () => {
    expect(rateLimited().retryable).toBe(true);
    expect(providerUnavailable().retryable).toBe(true);
  });

  it('ambiguous timeout is not retryable', () => {
    expect(timeout('t', true).retryable).toBe(false);
  });

  it('no_output and filtered are not retryable', () => {
    expect(noOutput().retryable).toBe(false);
    expect(filtered().retryable).toBe(false);
  });
});

describe('fake adapter failTimes', () => {
  it('fails then succeeds', async () => {
    const adapter = new FakeModelAdapter({
      failWith: new CreationError('rate_limited', 'slow down', true, 429),
      failTimes: 1,
    });
    const engine = new CreationEngine(adapter);
    await expect(
      engine.run({ operation: 'coloring.generate', quality: 'draft', prompt: 'cat', inputs: [] }, [])
    ).rejects.toMatchObject({ category: 'rate_limited' });
    const ok = await engine.run(
      { operation: 'coloring.generate', quality: 'draft', prompt: 'cat', inputs: [] },
      []
    );
    expect(ok.kind).toBe('image');
    expect(adapter.calls).toBe(2);
  });
});
