import { describe, expect, it } from 'vitest';
import {
  CARD_EXPORT_HEIGHT,
  CARD_EXPORT_WIDTH,
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_EXPORT_SCALE,
  defaultCardDocument,
  mapLegacyTheme,
} from '../../shared/cards';

describe('CardDocumentV1', () => {
  it('defaults schemaVersion 1', () => {
    const doc = defaultCardDocument('Sparkfox');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.name).toBe('Sparkfox');
    expect(doc.presentation.layout).toBe('standard-5x7-v1');
    expect(doc.moves.length).toBeGreaterThan(0);
  });

  it('maps legacy pokemon theme to creature', () => {
    expect(mapLegacyTheme('pokemon')).toBe('creature');
    expect(mapLegacyTheme('custom')).toBe('custom');
  });

  it('export dimensions are 1500×2100 via design scale', () => {
    expect(CARD_DESIGN_WIDTH * CARD_EXPORT_SCALE).toBe(CARD_EXPORT_WIDTH);
    expect(CARD_DESIGN_HEIGHT * CARD_EXPORT_SCALE).toBe(CARD_EXPORT_HEIGHT);
    expect(CARD_EXPORT_WIDTH).toBe(1500);
    expect(CARD_EXPORT_HEIGHT).toBe(2100);
  });
});
