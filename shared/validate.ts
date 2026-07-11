import {
  CREATION_OPERATIONS,
  CREATION_QUALITIES,
  type CreationInputRole,
  type CreationOperation,
  type CreationQuality,
  type CreationRequest,
} from './creation';

export const MAX_CREATION_INPUTS = 4;
export const ALLOWED_INPUT_ROLES: CreationInputRole[] = ['base', 'character', 'style', 'mask'];

const REQUIRES_PROMPT: CreationOperation[] = [
  'coloring.generate',
  'card-art.generate',
  'card-copy.suggest',
  'prompt.improve',
];
const REQUIRES_INSTRUCTION: CreationOperation[] = ['coloring.edit', 'card-art.edit'];
const REQUIRES_BASE: CreationOperation[] = ['coloring.edit', 'coloring.enhance', 'card-art.edit'];

export type ParseResult = { ok: true; request: CreationRequest } | { ok: false; error: string };

/**
 * Validate and parse a CreationRequest before credit reservation.
 */
export function parseAndValidateCreationRequest(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  const operation = b.operation as CreationOperation;
  const quality = ((b.quality as CreationQuality) || 'standard') as CreationQuality;

  if (!CREATION_OPERATIONS.includes(operation)) return { ok: false, error: 'Invalid operation' };
  if (!CREATION_QUALITIES.includes(quality)) return { ok: false, error: 'Invalid quality' };

  const rawInputs = Array.isArray(b.inputs) ? b.inputs : [];
  if (rawInputs.length > MAX_CREATION_INPUTS) {
    return { ok: false, error: `Too many inputs (max ${MAX_CREATION_INPUTS})` };
  }

  const inputs: CreationRequest['inputs'] = [];
  const seenRoles = new Set<string>();

  for (let idx = 0; idx < rawInputs.length; idx++) {
    const raw = rawInputs[idx];
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid input' };
    const i = raw as Record<string, unknown>;
    if (typeof i.assetId !== 'string' || !i.assetId.trim()) {
      return { ok: false, error: 'Invalid input asset' };
    }
    if (typeof i.role !== 'string' || !ALLOWED_INPUT_ROLES.includes(i.role as CreationInputRole)) {
      return { ok: false, error: `Invalid input role (allowed: ${ALLOWED_INPUT_ROLES.join(', ')})` };
    }
    if (seenRoles.has(i.role)) {
      return { ok: false, error: `Duplicate input role: ${i.role}` };
    }
    seenRoles.add(i.role);
    inputs.push({
      assetId: i.assetId.trim(),
      role: i.role as CreationInputRole,
      position: typeof i.position === 'number' ? i.position : idx,
    });
  }

  const prompt = typeof b.prompt === 'string' ? b.prompt : undefined;
  const instruction = typeof b.instruction === 'string' ? b.instruction : undefined;

  if (prompt && prompt.length > 1000) return { ok: false, error: 'Prompt too long (max 1000 characters)' };
  if (instruction && instruction.length > 1000) {
    return { ok: false, error: 'Instruction too long (max 1000 characters)' };
  }

  if (REQUIRES_PROMPT.includes(operation) && !prompt?.trim()) {
    return { ok: false, error: 'Prompt is required' };
  }
  if (REQUIRES_INSTRUCTION.includes(operation) && !instruction?.trim()) {
    return { ok: false, error: 'Instruction is required' };
  }
  if (REQUIRES_BASE.includes(operation) && !inputs.some((i) => i.role === 'base')) {
    return { ok: false, error: 'A base input asset is required' };
  }

  return {
    ok: true,
    request: {
      operation,
      quality,
      prompt,
      instruction,
      inputs,
      worldId: typeof b.worldId === 'string' ? b.worldId : undefined,
      artworkId: typeof b.artworkId === 'string' ? b.artworkId : undefined,
      parentRevisionId: typeof b.parentRevisionId === 'string' ? b.parentRevisionId : undefined,
      targetCardId: typeof b.targetCardId === 'string' ? b.targetCardId : undefined,
      expectedCardRevisionId:
        typeof b.expectedCardRevisionId === 'string' ? b.expectedCardRevisionId : undefined,
    },
  };
}
