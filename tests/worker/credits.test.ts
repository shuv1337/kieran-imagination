import { describe, expect, it } from 'vitest';
import { CREDITS_PER_ATTEMPT, MAX_PROVIDER_ATTEMPTS, maxReservedCredits } from '../../shared/creation';

/**
 * Credit table constants — concurrent limit enforcement is covered by
 * credits-trigger.test.ts against production migration SQL.
 */
describe('daily credit reservation constants', () => {
  it('reserves attempt_credits * max_attempts', () => {
    expect(maxReservedCredits({ operation: 'coloring.generate', quality: 'draft' })).toBe(
      CREDITS_PER_ATTEMPT.draft * MAX_PROVIDER_ATTEMPTS
    );
    expect(maxReservedCredits({ operation: 'coloring.generate', quality: 'premium' })).toBe(
      CREDITS_PER_ATTEMPT.premium * MAX_PROVIDER_ATTEMPTS
    );
    expect(maxReservedCredits({ operation: 'prompt.improve', quality: 'draft' })).toBe(2);
  });
});
