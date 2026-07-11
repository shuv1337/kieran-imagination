import { describe, expect, it } from 'vitest';
import { CreationEngine } from '../../server/creation/engine';
import { FakeModelAdapter } from '../../server/creation/fake';
import { buildSemanticRepairRequest } from '../../server/creation/repair';
import type { CreationRequest } from '../../shared/creation';

describe('semantic repair request (R3-1)', () => {
  it('injects repair raw as base in request.inputs for coloring.generate', () => {
    const original: CreationRequest = {
      operation: 'coloring.generate',
      quality: 'standard',
      prompt: 'a dragon',
      inputs: [],
    };
    const repair = buildSemanticRepairRequest(original, 'raw-attempt-1');
    expect(repair.operation).toBe('coloring.edit');
    expect(repair.inputs.some((i) => i.role === 'base' && i.assetId === 'raw-attempt-1')).toBe(
      true
    );
    expect(repair.instruction).toMatch(/CRITICAL REPAIR/);
  });

  it('engine.validate accepts repair request without invalid_input', async () => {
    const adapter = new FakeModelAdapter();
    const engine = new CreationEngine(adapter);
    const original: CreationRequest = {
      operation: 'coloring.generate',
      quality: 'draft',
      prompt: 'cat',
      inputs: [],
    };
    // Without repair: generate needs no base — OK
    // With repair path: edit requires base on request.inputs
    const repair = buildSemanticRepairRequest(original, 'raw-1');
    const profile = engine.validate(repair);
    expect(profile.operation).toBe('coloring.edit');

    // Full run reaches adapter (not invalid_input)
    const result = await engine.run(repair, [
      {
        assetId: 'raw-1',
        role: 'base',
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
      },
    ]);
    expect(result.kind).toBe('image');
    expect(adapter.calls).toBe(1);
  });

  it('generate without base on request.inputs would fail if forced to edit without repair inputs', () => {
    const engine = new CreationEngine(new FakeModelAdapter());
    expect(() =>
      engine.validate({
        operation: 'coloring.edit',
        quality: 'draft',
        instruction: 'fix',
        inputs: [],
      })
    ).toThrow(/base/i);
  });

  it('preserves non-base original inputs', () => {
    const original: CreationRequest = {
      operation: 'coloring.generate',
      quality: 'standard',
      prompt: 'hero',
      inputs: [{ assetId: 'char-1', role: 'character', position: 0 }],
    };
    const repair = buildSemanticRepairRequest(original, 'raw-x');
    expect(repair.inputs.find((i) => i.role === 'base')?.assetId).toBe('raw-x');
    expect(repair.inputs.find((i) => i.role === 'character')?.assetId).toBe('char-1');
  });
});
