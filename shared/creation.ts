/** Shared Creation Engine contracts (browser + worker). */

export type CreationOperation =
  | 'coloring.generate'
  | 'coloring.edit'
  | 'coloring.enhance'
  | 'card-art.generate'
  | 'card-art.edit'
  | 'card-copy.suggest'
  | 'prompt.improve'
  | 'suggestions.generate';

export type CreationQuality = 'draft' | 'standard' | 'print' | 'premium';

export type CreationInputRole = 'base' | 'character' | 'style' | 'mask';

export interface CreationInput {
  assetId: string;
  role: CreationInputRole;
  position: number;
}

export interface CreationRequest {
  operation: CreationOperation;
  quality: CreationQuality;
  prompt?: string;
  instruction?: string;
  inputs: CreationInput[];
  worldId?: string;
  artworkId?: string;
  parentRevisionId?: string;
  /** Card art regenerate: target card + expected revision for optimistic concurrency. */
  targetCardId?: string;
  expectedCardRevisionId?: string;
}

export type FailureCategory =
  | 'invalid_input'
  | 'filtered'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'timeout'
  | 'no_output'
  | 'normalization_failed'
  | 'budget_exceeded'
  | 'cancelled'
  | 'internal';

export const IMAGE_OPERATIONS: CreationOperation[] = [
  'coloring.generate',
  'coloring.edit',
  'coloring.enhance',
  'card-art.generate',
  'card-art.edit',
];

export const TEXT_OPERATIONS: CreationOperation[] = [
  'card-copy.suggest',
  'prompt.improve',
  'suggestions.generate',
];

export function isImageOperation(op: CreationOperation): boolean {
  return IMAGE_OPERATIONS.includes(op);
}

export function isTextOperation(op: CreationOperation): boolean {
  return TEXT_OPERATIONS.includes(op);
}

export const CREATION_OPERATIONS: CreationOperation[] = [
  ...IMAGE_OPERATIONS,
  ...TEXT_OPERATIONS,
];

export const CREATION_QUALITIES: CreationQuality[] = [
  'draft',
  'standard',
  'print',
  'premium',
];

/** Fixed integer credits per provider attempt (by quality route / text). */
export const CREDITS_PER_ATTEMPT: Record<CreationQuality | 'text', number> = {
  draft: 1,
  standard: 1,
  print: 1,
  premium: 1,
  text: 1,
};

export const MAX_PROVIDER_ATTEMPTS = 2;

export function creditsForRequest(req: Pick<CreationRequest, 'operation' | 'quality'>): number {
  if (isTextOperation(req.operation)) {
    return CREDITS_PER_ATTEMPT.text;
  }
  return CREDITS_PER_ATTEMPT[req.quality];
}

export function maxReservedCredits(req: Pick<CreationRequest, 'operation' | 'quality'>): number {
  return creditsForRequest(req) * MAX_PROVIDER_ATTEMPTS;
}

export function stableRequestHash(req: CreationRequest): string {
  // Deterministic JSON for idempotency comparison
  return JSON.stringify({
    operation: req.operation,
    quality: req.quality,
    prompt: req.prompt ?? null,
    instruction: req.instruction ?? null,
    inputs: [...req.inputs]
      .sort((a, b) => a.position - b.position || a.assetId.localeCompare(b.assetId))
      .map((i) => ({ assetId: i.assetId, role: i.role, position: i.position })),
    worldId: req.worldId ?? null,
    artworkId: req.artworkId ?? null,
    parentRevisionId: req.parentRevisionId ?? null,
    targetCardId: req.targetCardId ?? null,
    expectedCardRevisionId: req.expectedCardRevisionId ?? null,
  });
}

export interface ImprovedPromptResult {
  improvedPrompt: string;
}

export interface SuggestionsResult {
  suggestions: string[];
}

export interface CardCopySuggestion {
  id: string;
  name: string;
  description: string;
  power?: number;
  cost?: string[];
}

export interface CardCopySuggestResult {
  moves: CardCopySuggestion[];
  flavorText?: string;
}
