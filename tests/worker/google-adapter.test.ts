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
      modelId: 'gemini-3.1-flash-lite-image',
      prompt: 'cat',
      images: [],
      imageOnly: true,
    });
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe('image/png');
    expect(result.modelId).toBe('gemini-3.1-flash-lite-image');
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

  it('maps a depleted prepaid balance (402) to a non-retryable, uncharged account error', () => {
    const err = mapGoogleError(
      Object.assign(
        new Error(
          '{"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}'
        ),
        { status: 402 }
      )
    );
    expect(err).toMatchObject({ category: 'provider_account', retryable: false, providerTouched: false });
  });

  it('maps an invalid API key to provider_account', () => {
    expect(
      mapGoogleError(Object.assign(new Error('API key not valid'), { status: 400 })).category
    ).toBe('provider_account');
  });

  it('does not treat "generate" in a message as a rate limit', () => {
    const err = mapGoogleError(
      Object.assign(
        new Error('models/x is not found for API version v1beta, or is not supported for generateContent'),
        { status: 404 }
      )
    );
    expect(err.category).not.toBe('rate_limited');
  });
});
