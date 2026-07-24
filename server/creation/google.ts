/**
 * Sole module that imports @google/genai.
 *
 * Image path uses generateContent with responseModalities: ['IMAGE'] (image-only)
 * and local R2 persistence (store:false semantics). Interactions API is not used:
 * for the production catalog model (gemini-3.1-flash-lite-image), generateContent
 * is the supported SDK path for one-shot image generation in @google/genai 2.x.
 * Provider interaction IDs are optional provenance only.
 */
import { GoogleGenAI } from '@google/genai';
import type {
  ModelAdapter,
  ProviderImageRequest,
  ProviderImageResult,
  ProviderObjectRequest,
  ProviderObjectResult,
} from './engine';
import {
  filtered,
  noOutput,
  providerUnavailable,
  rateLimited,
  timeout,
  CreationError,
} from './errors';

const BLOCKED_FINISH = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'RECITATION',
  'SPII',
  'IMAGE_SAFETY',
  'OTHER',
  'BLOCKLIST',
]);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function mapGoogleError(error: unknown): CreationError {
  if (error instanceof CreationError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const status =
    (error as { status?: number })?.status ??
    (error as { httpStatusCode?: number })?.httpStatusCode ??
    (error as { code?: number })?.code;

  const lower = message.toLowerCase();

  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('rate')) {
    return rateLimited(message);
  }
  if (status === 408 || lower.includes('timeout') || lower.includes('deadline')) {
    return timeout(message, true);
  }
  if (typeof status === 'number' && status >= 500) {
    return providerUnavailable(message);
  }
  if (lower.includes('safety') || lower.includes('blocked') || lower.includes('prohibited')) {
    return filtered(message);
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnreset')) {
    // Pre-response network failure — retryable, no charge
    return providerUnavailable(message, false);
  }
  // Default: treat as post-contact provider issue (charge conservatively)
  return providerUnavailable(message, true);
}

export class GoogleModelAdapter implements ModelAdapter {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateImage(request: ProviderImageRequest): Promise<ProviderImageResult> {
    try {
      const parts: Array<Record<string, unknown>> = [];

      for (const img of request.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/png',
            data: bytesToBase64(img.bytes),
          },
        });
      }
      parts.push({ text: request.prompt });

      const imageConfig: Record<string, unknown> = {};
      if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
      // Some models accept imageSize; ignore if unsupported at runtime
      if (request.imageSize) imageConfig.imageSize = request.imageSize;

      const response = await this.ai.models.generateContent({
        model: request.modelId,
        contents: parts,
        config: {
          responseModalities: request.imageOnly ? ['IMAGE'] : ['TEXT', 'IMAGE'],
          imageConfig,
        },
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason as string | undefined;
      const blockReason = response.promptFeedback?.blockReason as string | undefined;

      if (blockReason || (finishReason && BLOCKED_FINISH.has(finishReason))) {
        throw filtered(`Content filtered: ${blockReason || finishReason}`);
      }

      if (!candidate?.content?.parts) {
        throw noOutput('No image generated');
      }

      let imageB64 = '';
      let mimeType = 'image/png';
      for (const part of candidate.content.parts as Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>) {
        if (part.inlineData?.data) {
          imageB64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }

      if (!imageB64) {
        throw noOutput('No image data found in response');
      }

      const usage = response.usageMetadata as
        | { promptTokenCount?: number; candidatesTokenCount?: number }
        | undefined;

      return {
        bytes: base64ToBytes(imageB64),
        mimeType,
        modelId: request.modelId,
        providerInteractionId: (response as { responseId?: string }).responseId,
        usage: {
          inputTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
        },
      };
    } catch (error) {
      throw mapGoogleError(error);
    }
  }

  async generateObject<T>(request: ProviderObjectRequest<T>): Promise<ProviderObjectResult<T>> {
    try {
      const response = await this.ai.models.generateContent({
        model: request.modelId,
        contents: [{ text: request.prompt }],
        config: {
          responseModalities: ['TEXT'],
        },
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason as string | undefined;
      const blockReason = response.promptFeedback?.blockReason as string | undefined;

      if (blockReason || (finishReason && BLOCKED_FINISH.has(finishReason))) {
        throw filtered(`Content filtered: ${blockReason || finishReason}`);
      }

      let text = '';
      for (const part of (candidate?.content?.parts ?? []) as Array<{ text?: string }>) {
        if (part.text) text += part.text;
      }

      if (!text.trim()) {
        throw noOutput('Empty text response');
      }

      let value: T;
      try {
        value = request.parse(text);
      } catch (parseError) {
        if (request.fallback !== undefined) {
          value = request.fallback as T;
        } else {
          throw noOutput(
            parseError instanceof Error ? parseError.message : 'Could not parse structured text'
          );
        }
      }

      const usage = response.usageMetadata as
        | { promptTokenCount?: number; candidatesTokenCount?: number }
        | undefined;

      return {
        value,
        modelId: request.modelId,
        rawText: text,
        usage: {
          inputTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
        },
      };
    } catch (error) {
      throw mapGoogleError(error);
    }
  }
}
