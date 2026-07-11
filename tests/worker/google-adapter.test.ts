import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mapGoogleError } from '../../server/creation/google';
import { filtered, noOutput } from '../../server/creation/errors';

// Mock @google/genai before importing adapter class usage paths that call the SDK.
const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

describe('GoogleModelAdapter response mapping', () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it('success image extracts inline bytes', async () => {
    const { GoogleModelAdapter } = await import('../../server/creation/google');
    const pngB64 = btoa('fakepng');
    generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: pngB64, mimeType: 'image/png' } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    });
    const adapter = new GoogleModelAdapter('key');
    const result = await adapter.generateImage({
      modelId: 'gemini-3.1-flash-image',
      prompt: 'cat',
      images: [],
      imageOnly: true,
    });
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe('image/png');
    expect(result.modelId).toBe('gemini-3.1-flash-image');
  });

  it('maps no image parts to no_output', async () => {
    const { GoogleModelAdapter } = await import('../../server/creation/google');
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'sorry' }] } }],
    });
    const adapter = new GoogleModelAdapter('key');
    await expect(
      adapter.generateImage({
        modelId: 'm',
        prompt: 'x',
        images: [],
        imageOnly: true,
      })
    ).rejects.toMatchObject({ category: 'no_output' });
  });

  it('maps safety finishReason to filtered', async () => {
    const { GoogleModelAdapter } = await import('../../server/creation/google');
    generateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
    });
    const adapter = new GoogleModelAdapter('key');
    await expect(
      adapter.generateImage({
        modelId: 'm',
        prompt: 'x',
        images: [],
        imageOnly: true,
      })
    ).rejects.toMatchObject({ category: 'filtered' });
  });

  it('mapGoogleError covers 429 and timeout', () => {
    expect(mapGoogleError(Object.assign(new Error('rate'), { status: 429 })).category).toBe(
      'rate_limited'
    );
    expect(mapGoogleError(new Error('deadline exceeded timeout')).category).toBe('timeout');
    expect(mapGoogleError(filtered('x'))).toMatchObject({ category: 'filtered' });
    expect(mapGoogleError(noOutput())).toMatchObject({ category: 'no_output' });
  });
});
