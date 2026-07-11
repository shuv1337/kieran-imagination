import type { CreationOperation, CreationQuality } from '../../shared/creation';
import { getModelForQuality, getTextModel, type ModelDefinition } from './models';

export type ProfileId =
  | 'coloring-generate.v1'
  | 'coloring-edit.v1'
  | 'coloring-enhance.v1'
  | 'card-art-generate.v1'
  | 'card-art-edit.v1'
  | 'card-copy-suggest.v1'
  | 'prompt-improve.v1'
  | 'suggestions-generate.v1';

export interface CreationProfile {
  id: ProfileId;
  operation: CreationOperation;
  aspectRatio: string | null;
  imageOnly: boolean;
  textRich: boolean;
  requiresPrompt: boolean;
  requiresInstruction: boolean;
  requiresBaseInput: boolean;
  kind: 'image' | 'text';
}

export const PROFILES: Record<ProfileId, CreationProfile> = {
  'coloring-generate.v1': {
    id: 'coloring-generate.v1',
    operation: 'coloring.generate',
    aspectRatio: '3:4',
    imageOnly: true,
    textRich: false,
    requiresPrompt: true,
    requiresInstruction: false,
    requiresBaseInput: false,
    kind: 'image',
  },
  'coloring-edit.v1': {
    id: 'coloring-edit.v1',
    operation: 'coloring.edit',
    aspectRatio: '3:4',
    imageOnly: true,
    textRich: false,
    requiresPrompt: false,
    requiresInstruction: true,
    requiresBaseInput: true,
    kind: 'image',
  },
  'coloring-enhance.v1': {
    id: 'coloring-enhance.v1',
    operation: 'coloring.enhance',
    aspectRatio: '3:4',
    imageOnly: true,
    textRich: false,
    requiresPrompt: false,
    requiresInstruction: false,
    requiresBaseInput: true,
    kind: 'image',
  },
  'card-art-generate.v1': {
    id: 'card-art-generate.v1',
    operation: 'card-art.generate',
    aspectRatio: '2:3',
    imageOnly: true,
    textRich: false,
    requiresPrompt: true,
    requiresInstruction: false,
    requiresBaseInput: false,
    kind: 'image',
  },
  'card-art-edit.v1': {
    id: 'card-art-edit.v1',
    operation: 'card-art.edit',
    aspectRatio: '2:3',
    imageOnly: true,
    textRich: false,
    requiresPrompt: false,
    requiresInstruction: true,
    requiresBaseInput: true,
    kind: 'image',
  },
  'card-copy-suggest.v1': {
    id: 'card-copy-suggest.v1',
    operation: 'card-copy.suggest',
    aspectRatio: null,
    imageOnly: false,
    textRich: true,
    requiresPrompt: true,
    requiresInstruction: false,
    requiresBaseInput: false,
    kind: 'text',
  },
  'prompt-improve.v1': {
    id: 'prompt-improve.v1',
    operation: 'prompt.improve',
    aspectRatio: null,
    imageOnly: false,
    textRich: false,
    requiresPrompt: true,
    requiresInstruction: false,
    requiresBaseInput: false,
    kind: 'text',
  },
  'suggestions-generate.v1': {
    id: 'suggestions-generate.v1',
    operation: 'suggestions.generate',
    aspectRatio: null,
    imageOnly: false,
    textRich: false,
    requiresPrompt: false,
    requiresInstruction: false,
    requiresBaseInput: false,
    kind: 'text',
  },
};

const OP_TO_PROFILE: Record<CreationOperation, ProfileId> = {
  'coloring.generate': 'coloring-generate.v1',
  'coloring.edit': 'coloring-edit.v1',
  'coloring.enhance': 'coloring-enhance.v1',
  'card-art.generate': 'card-art-generate.v1',
  'card-art.edit': 'card-art-edit.v1',
  'card-copy.suggest': 'card-copy-suggest.v1',
  'prompt.improve': 'prompt-improve.v1',
  'suggestions.generate': 'suggestions-generate.v1',
};

export function profileForOperation(operation: CreationOperation): CreationProfile {
  return PROFILES[OP_TO_PROFILE[operation]];
}

export function resolveModel(profile: CreationProfile, quality: CreationQuality): ModelDefinition {
  if (profile.kind === 'text') {
    return getTextModel(profile.textRich);
  }
  return getModelForQuality(quality);
}
