/**
 * Production smoke checklist (manual after deploy) + light invariants.
 *
 * 1. Log in with FAMILY_ACCESS_CODE
 * 2. Create directly from the home screen with no setup step
 * 3. Generate one Draft coloring page
 * 4. Refresh while a Standard edit is running and confirm it reconnects
 * 5. Save one Editor revision
 * 6. Create a card, edit text/theme, regenerate only art, export PNG (1500×2100)
 * 7. Confirm new assets are absent from Hot or Not
 * 8. Confirm daily credits reserved/used reconcile (reserved returns to 0 after settle)
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_EXPORT_HEIGHT,
  CARD_EXPORT_WIDTH,
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_EXPORT_SCALE,
} from '../../shared/cards';
import { CREDITS_PER_ATTEMPT, MAX_PROVIDER_ATTEMPTS } from '../../shared/creation';
import { RECENT_TERMINAL_WINDOW_MS } from '../../shared/jobs';

describe('e2e smoke invariants', () => {
  it('card export size target via design scale', () => {
    expect(CARD_DESIGN_WIDTH * CARD_EXPORT_SCALE).toBe(1500);
    expect(CARD_DESIGN_HEIGHT * CARD_EXPORT_SCALE).toBe(2100);
    expect(CARD_EXPORT_WIDTH).toBe(1500);
    expect(CARD_EXPORT_HEIGHT).toBe(2100);
  });

  it('credit table matches plan', () => {
    expect(CREDITS_PER_ATTEMPT).toEqual({
      draft: 1,
      standard: 1,
      print: 1,
      premium: 1,
      text: 1,
    });
    expect(MAX_PROVIDER_ATTEMPTS).toBe(2);
  });

  it('recent terminal job window is positive for reconnect', () => {
    expect(RECENT_TERMINAL_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
