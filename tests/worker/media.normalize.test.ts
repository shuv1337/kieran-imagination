import { describe, expect, it } from 'vitest';
import {
  COLORING_MASTER,
  COLORING_PREVIEW,
  MAX_UPLOAD_BYTES,
  PRINT_CANVAS,
  geometryForOperation,
  normalizeImage,
  semanticCheckColoringImage,
  sha256Hex,
  type ImagesBinding,
} from '../../server/media/normalize';
import { CARD_DESIGN_HEIGHT, CARD_DESIGN_WIDTH, CARD_EXPORT_SCALE, CARD_EXPORT_HEIGHT, CARD_EXPORT_WIDTH } from '../../shared/cards';

const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);

function mockImages(info: { width: number; height: number; format: string }): ImagesBinding {
  return {
    async info() {
      return info;
    },
    input(data: ArrayBuffer) {
      return {
        transform() {
          return {
            async output() {
              return {
                async response() {
                  return new Response(data);
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('media normalization policy', () => {
  it('coloring master/preview geometry', () => {
    expect(COLORING_MASTER).toEqual({ width: 1536, height: 2048 });
    expect(COLORING_PREVIEW).toEqual({ width: 768, height: 1024 });
    expect(PRINT_CANVAS).toEqual({ width: 2550, height: 3300 });
  });

  it('upload cap is 10 MiB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('geometry by operation', () => {
    expect(geometryForOperation('coloring.generate')).toBe('coloring');
    expect(geometryForOperation('card-art.edit')).toBe('card-art');
    expect(geometryForOperation('prompt.improve')).toBe('generic');
  });

  it('sha256 is stable', async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('rejects empty bytes', async () => {
    await expect(normalizeImage(undefined, new Uint8Array(), 'coloring')).rejects.toMatchObject({
      category: 'normalization_failed',
    });
  });

  it('local fallback without Images binding', async () => {
    const v = await normalizeImage(undefined, TINY_PNG, 'coloring');
    expect(v.master.bytes.length).toBeGreaterThan(0);
    expect(v.preview.bytes.length).toBeGreaterThan(0);
  });

  it('mock Images produces master/preview sizes', async () => {
    const images = mockImages({ width: 800, height: 1067, format: 'image/png' });
    const v = await normalizeImage(images, TINY_PNG, 'coloring');
    expect(v.master.width).toBe(COLORING_MASTER.width);
    expect(v.master.height).toBe(COLORING_MASTER.height);
    expect(v.preview.mimeType).toBe('image/webp');
    expect(v.print).toBeNull(); // source too small for print
  });

  it('Images info() failure becomes normalization_failed', async () => {
    const images: ImagesBinding = {
      async info() {
        throw new Error('corrupt');
      },
      input() {
        throw new Error('should not transform');
      },
    };
    await expect(normalizeImage(images, TINY_PNG, 'coloring')).rejects.toMatchObject({
      category: 'normalization_failed',
    });
  });

  it('semantic check rejects empty', () => {
    expect(semanticCheckColoringImage(new Uint8Array(10), 100, 100).ok).toBe(false);
  });

  it('semantic check rejects wrong aspect', () => {
    const bytes = new Uint8Array(200).fill(255);
    // Wide landscape 2:1
    expect(semanticCheckColoringImage(bytes, 2000, 1000).ok).toBe(false);
  });

  it('semantic check accepts near 3:4 monochrome-ish', () => {
    const bytes = new Uint8Array(500).fill(255);
    // sprinkle black
    for (let i = 0; i < 50; i++) bytes[i] = 0;
    expect(semanticCheckColoringImage(bytes, 750, 1000).ok).toBe(true);
  });
});

describe('card export dimensions', () => {
  it('design * scale equals export', () => {
    expect(CARD_DESIGN_WIDTH * CARD_EXPORT_SCALE).toBe(CARD_EXPORT_WIDTH);
    expect(CARD_DESIGN_HEIGHT * CARD_EXPORT_SCALE).toBe(CARD_EXPORT_HEIGHT);
    expect(CARD_EXPORT_WIDTH).toBe(1500);
    expect(CARD_EXPORT_HEIGHT).toBe(2100);
  });
});
