import type {
  ModelAdapter,
  ProviderImageRequest,
  ProviderImageResult,
  ProviderObjectRequest,
  ProviderObjectResult,
} from './engine';

/** Deterministic 1x1 PNG (black pixel) for tests. */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface FakeAdapterOptions {
  failWith?: Error;
  failTimes?: number;
  objectResult?: unknown;
  imageBytes?: Uint8Array;
  modelId?: string;
}

export class FakeModelAdapter implements ModelAdapter {
  calls = 0;
  private remainingFails: number;

  constructor(private options: FakeAdapterOptions = {}) {
    this.remainingFails = options.failTimes ?? (options.failWith ? 1 : 0);
  }

  async generateImage(request: ProviderImageRequest): Promise<ProviderImageResult> {
    this.calls += 1;
    if (this.remainingFails > 0) {
      this.remainingFails -= 1;
      throw this.options.failWith ?? new Error('fake failure');
    }
    return {
      bytes: this.options.imageBytes ?? b64ToBytes(TINY_PNG_B64),
      mimeType: 'image/png',
      modelId: this.options.modelId ?? request.modelId,
      providerInteractionId: `fake-${this.calls}`,
    };
  }

  async generateObject<T>(request: ProviderObjectRequest<T>): Promise<ProviderObjectResult<T>> {
    this.calls += 1;
    if (this.remainingFails > 0) {
      this.remainingFails -= 1;
      throw this.options.failWith ?? new Error('fake failure');
    }
    const value = (this.options.objectResult ?? request.fallback) as T;
    return {
      value,
      modelId: this.options.modelId ?? request.modelId,
      rawText: JSON.stringify(value),
    };
  }
}
