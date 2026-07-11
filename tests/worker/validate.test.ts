import { describe, expect, it } from 'vitest';
import { parseAndValidateCreationRequest, MAX_CREATION_INPUTS } from '../../shared/validate';
import {
  shouldChargeAttempt,
  shouldRetryAttempt,
  sanitizeErrorMessage,
  invalidInput,
  filtered,
  rateLimited,
  timeout,
  noOutput,
  providerUnavailable,
  PUBLIC_ERROR_MESSAGES,
} from '../../server/creation/errors';

describe('parseAndValidateCreationRequest', () => {
  it('accepts valid coloring generate', () => {
    const r = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'draft',
      prompt: 'a cat',
      inputs: [],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing prompt', () => {
    const r = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'draft',
      inputs: [],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects missing base for edit', () => {
    const r = parseAndValidateCreationRequest({
      operation: 'coloring.edit',
      quality: 'standard',
      instruction: 'add stars',
      inputs: [],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects too many inputs', () => {
    const inputs = Array.from({ length: MAX_CREATION_INPUTS + 1 }, (_, i) => ({
      assetId: `a${i}`,
      role: ['base', 'character', 'style', 'mask', 'base'][i],
      position: i,
    }));
    const r = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'draft',
      prompt: 'x',
      inputs,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown roles', () => {
    const r = parseAndValidateCreationRequest({
      operation: 'coloring.generate',
      quality: 'draft',
      prompt: 'x',
      inputs: [{ assetId: 'a', role: 'evil', position: 0 }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate roles', () => {
    const r = parseAndValidateCreationRequest({
      operation: 'coloring.edit',
      quality: 'standard',
      instruction: 'x',
      inputs: [
        { assetId: 'a', role: 'base', position: 0 },
        { assetId: 'b', role: 'base', position: 1 },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe('charge and retry policy', () => {
  it('does not charge invalid_input', () => {
    expect(shouldChargeAttempt(invalidInput('bad'))).toBe(false);
  });

  it('charges filtered and no_output', () => {
    expect(shouldChargeAttempt(filtered())).toBe(true);
    expect(shouldChargeAttempt(noOutput())).toBe(true);
  });

  it('does not charge pre-response network failure', () => {
    expect(shouldChargeAttempt(providerUnavailable('fetch failed', false))).toBe(false);
  });

  it('retries rate_limited but not ambiguous timeout', () => {
    expect(shouldRetryAttempt(rateLimited())).toBe(true);
    expect(shouldRetryAttempt(timeout('t', true))).toBe(false);
  });
});

describe('sanitizeErrorMessage', () => {
  it('never returns raw provider text to clients', () => {
    const raw = filtered('SAFETY BLOCKED: internal model detail xyz');
    const s = sanitizeErrorMessage(raw);
    expect(s.message).toBe(PUBLIC_ERROR_MESSAGES.filtered);
    expect(s.message).not.toContain('xyz');
    expect(s.internalMessage).toContain('xyz');
  });
});
