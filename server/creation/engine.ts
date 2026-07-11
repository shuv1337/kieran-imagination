import type { CreationRequest } from '../../shared/creation';
import { CreationError, invalidInput, noOutput } from './errors';
import { profileForOperation, resolveModel, type CreationProfile } from './profiles';
import { buildPromptText } from './prompts';
import type { ModelDefinition } from './models';

export interface ProviderImagePart {
  mimeType: string;
  bytes: Uint8Array;
  role: string;
}

export interface ProviderImageRequest {
  modelId: string;
  prompt: string;
  images: ProviderImagePart[];
  aspectRatio?: string | null;
  imageSize?: string;
  imageOnly: boolean;
}

export interface ProviderImageResult {
  bytes: Uint8Array;
  mimeType: string;
  modelId: string;
  providerInteractionId?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ProviderObjectRequest<T> {
  modelId: string;
  prompt: string;
  schemaHint: string;
  fallback?: T;
  parse: (text: string) => T;
}

export interface ProviderObjectResult<T> {
  value: T;
  modelId: string;
  rawText: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelAdapter {
  generateImage(request: ProviderImageRequest): Promise<ProviderImageResult>;
  generateObject<T>(request: ProviderObjectRequest<T>): Promise<ProviderObjectResult<T>>;
}

export interface LoadedInputAsset {
  assetId: string;
  role: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface EngineImageResult {
  kind: 'image';
  bytes: Uint8Array;
  mimeType: string;
  modelId: string;
  profileId: string;
  providerInteractionId?: string;
  provenance: Record<string, unknown>;
}

export interface EngineTextResult {
  kind: 'text';
  value: unknown;
  modelId: string;
  profileId: string;
  provenance: Record<string, unknown>;
}

export type EngineResult = EngineImageResult | EngineTextResult;

export class CreationEngine {
  constructor(private adapter: ModelAdapter) {}

  validate(request: CreationRequest): CreationProfile {
    const profile = profileForOperation(request.operation);
    if (profile.requiresPrompt && !request.prompt?.trim()) {
      throw invalidInput('Prompt is required');
    }
    if (profile.requiresInstruction && !request.instruction?.trim()) {
      throw invalidInput('Instruction is required');
    }
    if (profile.requiresBaseInput) {
      const base = request.inputs.find((i) => i.role === 'base');
      if (!base) throw invalidInput('A base input asset is required');
    }
    if (request.prompt && request.prompt.length > 1000) {
      throw invalidInput('Prompt too long (max 1000 characters)');
    }
    if (request.instruction && request.instruction.length > 1000) {
      throw invalidInput('Instruction too long (max 1000 characters)');
    }
    return profile;
  }

  async run(request: CreationRequest, loadedInputs: LoadedInputAsset[]): Promise<EngineResult> {
    const profile = this.validate(request);
    const model = resolveModel(profile, request.quality);
    const prompt = buildPromptText(profile, request);

    if (profile.kind === 'image') {
      return this.runImage(profile, model, prompt, loadedInputs);
    }
    return this.runText(profile, model, prompt, request);
  }

  private async runImage(
    profile: CreationProfile,
    model: ModelDefinition,
    prompt: string,
    loadedInputs: LoadedInputAsset[]
  ): Promise<EngineImageResult> {
    const images: ProviderImagePart[] = loadedInputs
      .sort((a, b) => a.role.localeCompare(b.role))
      .map((a) => ({
        mimeType: a.mimeType,
        bytes: a.bytes,
        role: a.role,
      }));

    const result = await this.adapter.generateImage({
      modelId: model.modelId,
      prompt,
      images,
      aspectRatio: profile.aspectRatio,
      imageSize: model.imageSize,
      imageOnly: profile.imageOnly,
    });

    if (!result.bytes?.length) {
      throw noOutput('Provider returned empty image');
    }

    return {
      kind: 'image',
      bytes: result.bytes,
      mimeType: result.mimeType || 'image/png',
      modelId: result.modelId,
      profileId: profile.id,
      providerInteractionId: result.providerInteractionId,
      provenance: {
        profileId: profile.id,
        modelId: result.modelId,
        providerInteractionId: result.providerInteractionId,
        usage: result.usage,
      },
    };
  }

  private async runText(
    profile: CreationProfile,
    model: ModelDefinition,
    prompt: string,
    request: CreationRequest
  ): Promise<EngineTextResult> {
    const parseJson = <T>(text: string): T => {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
          return JSON.parse(cleaned.slice(start, end + 1)) as T;
        }
        throw noOutput('Could not parse structured text response');
      }
    };

    let schemaHint = 'JSON object';
    let parse: (text: string) => unknown = (t) => parseJson(t);
    let fallback: unknown = {};

    if (profile.operation === 'prompt.improve') {
      schemaHint = '{"improvedPrompt":"string"}';
      parse = (t) => {
        const v = parseJson<{ improvedPrompt?: string }>(t);
        if (!v.improvedPrompt?.trim()) throw noOutput('Missing improvedPrompt');
        return { improvedPrompt: v.improvedPrompt.trim() };
      };
      fallback = { improvedPrompt: request.prompt ?? '' };
    } else if (profile.operation === 'suggestions.generate') {
      schemaHint = '{"suggestions":["string"]}';
      parse = (t) => {
        const v = parseJson<{ suggestions?: string[] }>(t);
        if (!Array.isArray(v.suggestions) || v.suggestions.length === 0) {
          throw noOutput('Missing suggestions');
        }
        return { suggestions: v.suggestions.map(String).slice(0, 12) };
      };
      fallback = { suggestions: [] };
    } else if (profile.operation === 'card-copy.suggest') {
      schemaHint = '{"moves":[...],"flavorText":"string"}';
      parse = (t) => {
        const v = parseJson<{ moves?: unknown[]; flavorText?: string }>(t);
        if (!Array.isArray(v.moves) || v.moves.length === 0) {
          throw noOutput('Missing moves');
        }
        return {
          moves: v.moves.slice(0, 6),
          flavorText: v.flavorText ?? '',
        };
      };
      fallback = { moves: [], flavorText: '' };
    }

    const result = await this.adapter.generateObject({
      modelId: model.modelId,
      prompt,
      schemaHint,
      parse: parse as (text: string) => unknown,
      fallback,
    });

    return {
      kind: 'text',
      value: result.value,
      modelId: result.modelId,
      profileId: profile.id,
      provenance: {
        profileId: profile.id,
        modelId: result.modelId,
        usage: result.usage,
      },
    };
  }
}

export function assertCreationError(error: unknown): never {
  if (error instanceof CreationError) throw error;
  throw new CreationError('internal', error instanceof Error ? error.message : String(error));
}
