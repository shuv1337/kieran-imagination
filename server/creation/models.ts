import type { CreationQuality } from '../../shared/creation';

/** Stable model catalog — versioned TypeScript, not D1. */

export type ModelRoute =
  | 'draft'
  | 'standard'
  | 'print'
  | 'premium'
  | 'text-fast'
  | 'text-rich';

export interface ModelDefinition {
  route: ModelRoute;
  modelId: string;
  output: 'image' | 'text';
  /** Requested image size hint where applicable */
  imageSize?: '0.5K' | '1K' | '2K' | '4K';
  aspectRatioDefault?: string;
}

export const MODEL_CATALOG: Record<ModelRoute, ModelDefinition> = {
  draft: {
    route: 'draft',
    modelId: 'gemini-3.1-flash-image',
    output: 'image',
    imageSize: '0.5K',
    aspectRatioDefault: '3:4',
  },
  standard: {
    route: 'standard',
    modelId: 'gemini-3.1-flash-image',
    output: 'image',
    imageSize: '1K',
    aspectRatioDefault: '3:4',
  },
  print: {
    route: 'print',
    modelId: 'gemini-3-pro-image',
    output: 'image',
    imageSize: '4K',
    aspectRatioDefault: '3:4',
  },
  premium: {
    route: 'premium',
    modelId: 'gemini-3-pro-image',
    output: 'image',
    imageSize: '2K',
    aspectRatioDefault: '3:4',
  },
  'text-fast': {
    route: 'text-fast',
    modelId: 'gemini-3.1-flash-lite',
    output: 'text',
  },
  'text-rich': {
    route: 'text-rich',
    modelId: 'gemini-3.5-flash',
    output: 'text',
  },
};

export function qualityToRoute(quality: CreationQuality): ModelRoute {
  return quality;
}

export function getModelForQuality(quality: CreationQuality): ModelDefinition {
  return MODEL_CATALOG[qualityToRoute(quality)];
}

export function getTextModel(rich = false): ModelDefinition {
  return rich ? MODEL_CATALOG['text-rich'] : MODEL_CATALOG['text-fast'];
}

/** All stable model IDs used by this platform (for audits / tests). */
export function allStableModelIds(): string[] {
  return [...new Set(Object.values(MODEL_CATALOG).map((m) => m.modelId))];
}
