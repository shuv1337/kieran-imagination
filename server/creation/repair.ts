import type { CreationRequest } from '../../shared/creation';
import { REPAIR_COLORING_INSTRUCTION } from '../media/normalize';

/**
 * Build attempt-2 request after a coloring semantic failure.
 * Injects attempt-1 provider_raw as base so CreationEngine.validate passes for coloring.edit.
 */
export function buildSemanticRepairRequest(
  request: CreationRequest,
  repairRawAssetId: string
): CreationRequest {
  const repairInstruction = request.instruction
    ? `${REPAIR_COLORING_INSTRUCTION}\n\nOriginal instruction: ${request.instruction}`
    : request.prompt
      ? `${REPAIR_COLORING_INSTRUCTION}\n\nOriginal subject: ${request.prompt}`
      : REPAIR_COLORING_INSTRUCTION;

  const repairInputs: CreationRequest['inputs'] = [
    { assetId: repairRawAssetId, role: 'base', position: 0 },
    ...request.inputs
      .filter((i) => i.role !== 'base')
      .map((i, idx) => ({ ...i, position: idx + 1 })),
  ];

  return {
    ...request,
    operation: 'coloring.edit',
    instruction: repairInstruction,
    prompt: request.prompt,
    inputs: repairInputs,
  };
}
