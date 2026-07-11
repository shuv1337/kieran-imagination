import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { CreationEngine } from '../server/creation/engine';
import { GoogleModelAdapter } from '../server/creation/google';
import {
  CreationError,
  PUBLIC_ERROR_MESSAGES,
  shouldChargeAttempt,
  shouldRetryAttempt,
  sanitizeErrorMessage,
} from '../server/creation/errors';
import {
  creditsForRequest,
  isImageOperation,
  isTextOperation,
  MAX_PROVIDER_ATTEMPTS,
} from '../shared/creation';
import type { CreationRequest } from '../shared/creation';
import { MediaRepository } from '../server/media/repository';
import {
  geometryForOperation,
  normalizeImage,
  semanticCheckColoringImage,
} from '../server/media/normalize';
import { buildSemanticRepairRequest } from '../server/creation/repair';
import { WorldsRepository } from '../server/worlds/repository';
import { CardsRepository } from '../server/cards/repository';
import { failJobTerminal, getJob, updateJob } from './jobs';
import type { Env } from './env';

export type WorkflowParams = { jobId: string };

export class CreationWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { jobId } = event.payload;
    let chargeAttempts = 0;
    let attemptsUsed = 0;
    let request: CreationRequest | null = null;

    try {
      return await this.execute(jobId, step, (n) => {
        chargeAttempts = n.chargeAttempts;
        attemptsUsed = n.attemptsUsed;
        request = n.request;
      });
    } catch (error) {
      // Terminal safety net: any uncaught failure settles reserved credits
      const sanitized = sanitizeErrorMessage(error);
      console.error(
        JSON.stringify({
          scope: 'workflow-terminal',
          jobId,
          category: sanitized.category,
          internal: sanitized.internalMessage,
        })
      );
      const per = request ? creditsForRequest(request) : 0;
      await step.do('terminal-fail-settle', async () => {
        await failJobTerminal(this.env, jobId, {
          chargedCredits: chargeAttempts * per,
          category: sanitized.category,
          message: sanitized.message,
          attemptCount: attemptsUsed,
        });
      });
      return { status: 'failed', category: sanitized.category };
    }
  }

  private async execute(
    jobId: string,
    step: WorkflowStep,
    track: (s: {
      chargeAttempts: number;
      attemptsUsed: number;
      request: CreationRequest;
    }) => void
  ) {
    const job = await step.do('load-job', async () => {
      const j = await getJob(this.env, jobId);
      if (!j) throw new Error(`Job ${jobId} not found`);
      return j;
    });

    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      return { status: job.status };
    }

    const request = job.requestJson as CreationRequest;
    let chargeAttempts = 0;
    let attemptsUsed = 0;
    track({ chargeAttempts, attemptsUsed, request });

    await step.do('mark-running', async () => {
      await updateJob(this.env, jobId, { status: 'running', stage: 'input' });
    });

    const cancelledEarly = await step.do('check-cancel-early', async () => {
      const j = await getJob(this.env, jobId);
      return Boolean(j?.cancelRequestedAt);
    });

    if (cancelledEarly) {
      await step.do('cancel-release', async () => {
        await failJobTerminal(this.env, jobId, {
          chargedCredits: 0,
          category: 'cancelled',
          message: PUBLIC_ERROR_MESSAGES.cancelled,
          status: 'cancelled',
          attemptCount: 0,
        });
      });
      return { status: 'cancelled' };
    }

    // Validate inputs exist — return only IDs (no multi-MB step payloads)
    const inputRefs = await step.do('load-inputs', async () => {
      const media = new MediaRepository(this.env);
      const out: Array<{ assetId: string; role: string; mimeType: string }> = [];
      for (const input of request.inputs) {
        const asset = await media.get(input.assetId);
        if (!asset) {
          throw new CreationError('invalid_input', `Missing asset ${input.assetId}`, false, 400, false);
        }
        if (asset.ownerId !== job.ownerId) {
          throw new CreationError('invalid_input', 'Asset ownership mismatch', false, 403, false);
        }
        out.push({ assetId: asset.id, role: input.role, mimeType: asset.mimeType });
      }
      return out;
    });

    let lastError: { category: string; message: string } | null = null;
    let imageRawAssetId: string | null = null;
    let imageMime = 'image/png';
    let imageModelId = '';
    let imageProvenance: Record<string, unknown> = {};
    /** Attempt-1 raw used as base for semantic repair on attempt 2. */
    let repairBaseAssetId: string | null = null;
    let textResult: {
      value: unknown;
      modelId: string;
      profileId: string;
      provenance: Record<string, unknown>;
    } | null = null;

    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
      // Capture outer repair base for step closure
      const semanticRepairBaseId = repairBaseAssetId;

      const attemptResult = await step.do(`provider-attempt-${attempt}`, async () => {
        const j = await getJob(this.env, jobId);
        if (j?.cancelRequestedAt) {
          return { cancelled: true as const };
        }

        await updateJob(this.env, jobId, { stage: 'model', attemptCount: attempt });

        const media = new MediaRepository(this.env);

        const runColoringSemantic = async (bytes: Uint8Array) => {
          let w = 0;
          let h = 0;
          if (this.env.IMAGES) {
            try {
              const ab = bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength
              ) as ArrayBuffer;
              const info = await this.env.IMAGES.info(ab);
              w = info.width;
              h = info.height;
            } catch {
              /* ignore — aspect check skipped without dims */
            }
          }
          return semanticCheckColoringImage(bytes, w, h);
        };

        // Reuse existing provider_raw (crash after Google, before normalize)
        // Still re-run semantic check so bad coloring is not accepted on replay.
        if (isImageOperation(request.operation)) {
          const existingRaw = await media.findProviderRaw(jobId, attempt);
          if (existingRaw) {
            const rawBytes = await media.getBytes(existingRaw);
            if (request.operation.startsWith('coloring')) {
              const check = await runColoringSemantic(rawBytes);
              if (!check.ok) {
                return {
                  cancelled: false as const,
                  kind: 'error' as const,
                  category: 'normalization_failed',
                  message: PUBLIC_ERROR_MESSAGES.normalization_failed,
                  charged: true,
                  retryable: check.repairable && attempt < MAX_PROVIDER_ATTEMPTS,
                  semanticFail: true,
                  rawAssetId: existingRaw.id,
                };
              }
            }
            return {
              cancelled: false as const,
              kind: 'image' as const,
              rawAssetId: existingRaw.id,
              mimeType: existingRaw.mimeType,
              modelId: existingRaw.sourceModel || 'unknown',
              profileId: 'reused',
              provenance: { reusedRaw: true, attempt },
              charged: true,
              retryable: false,
              semanticFail: false,
            };
          }
        }

        // Load bytes from R2 inside the step (not from prior step payload)
        const loadedInputs: Array<{
          assetId: string;
          role: string;
          mimeType: string;
          bytes: Uint8Array;
        }> = [];
        for (const ref of inputRefs) {
          const asset = await media.get(ref.assetId);
          if (!asset) {
            throw new CreationError('invalid_input', `Missing asset ${ref.assetId}`, false, 400, false);
          }
          const bytes = await media.getBytes(asset);
          loadedInputs.push({
            assetId: asset.id,
            role: ref.role,
            mimeType: asset.mimeType,
            bytes,
          });
        }

        // Semantic repair: inject attempt-1 provider_raw as base + force coloring.edit
        let attemptRequest: CreationRequest = request;
        if (attempt >= 2 && semanticRepairBaseId && request.operation.startsWith('coloring')) {
          const repairAsset = await media.get(semanticRepairBaseId);
          if (repairAsset) {
            const repairBytes = await media.getBytes(repairAsset);
            // Replace any existing base with the failed attempt's raw output
            const withoutBase = loadedInputs.filter((i) => i.role !== 'base');
            withoutBase.unshift({
              assetId: repairAsset.id,
              role: 'base',
              mimeType: repairAsset.mimeType,
              bytes: repairBytes,
            });
            loadedInputs.length = 0;
            loadedInputs.push(...withoutBase);

            attemptRequest = buildSemanticRepairRequest(request, repairAsset.id);
          }
        }

        const adapter = new GoogleModelAdapter(this.env.GEMINI_API_KEY);
        const engine = new CreationEngine(adapter);

        try {
          const result = await engine.run(attemptRequest, loadedInputs);

          if (result.kind === 'image') {
            // Persist raw immediately before normalize / return
            const raw = await media.persistProviderRaw({
              ownerId: job.ownerId,
              jobId,
              attempt,
              sourceModel: result.modelId,
              rawBytes: result.bytes,
              rawMime: result.mimeType,
            });

            // Semantic check for coloring (may trigger second attempt)
            if (request.operation.startsWith('coloring')) {
              const check = await runColoringSemantic(result.bytes);
              if (!check.ok) {
                return {
                  cancelled: false as const,
                  kind: 'error' as const,
                  category: 'normalization_failed',
                  message: PUBLIC_ERROR_MESSAGES.normalization_failed,
                  charged: true,
                  retryable: check.repairable && attempt < MAX_PROVIDER_ATTEMPTS,
                  semanticFail: true,
                  rawAssetId: raw.id,
                };
              }
            }

            return {
              cancelled: false as const,
              kind: 'image' as const,
              rawAssetId: raw.id,
              mimeType: result.mimeType,
              modelId: result.modelId,
              profileId: result.profileId,
              provenance: result.provenance,
              charged: true,
              retryable: false,
              semanticFail: false,
            };
          }

          return {
            cancelled: false as const,
            kind: 'text' as const,
            value: result.value,
            modelId: result.modelId,
            profileId: result.profileId,
            provenance: result.provenance,
            charged: true,
            retryable: false,
          };
        } catch (error) {
          const sanitized = sanitizeErrorMessage(error);
          console.error(
            JSON.stringify({
              scope: 'provider-attempt',
              jobId,
              attempt,
              category: sanitized.category,
              internal: sanitized.internalMessage,
            })
          );
          const charged = shouldChargeAttempt(error);
          const retryable = shouldRetryAttempt(error);
          return {
            cancelled: false as const,
            kind: 'error' as const,
            category: sanitized.category,
            message: sanitized.message,
            charged,
            retryable,
            semanticFail: false,
          };
        }
      });

      if (attemptResult.cancelled) {
        await step.do('cancel-mid', async () => {
          const per = creditsForRequest(request);
          await failJobTerminal(this.env, jobId, {
            chargedCredits: chargeAttempts * per,
            category: 'cancelled',
            message: PUBLIC_ERROR_MESSAGES.cancelled,
            status: 'cancelled',
            attemptCount: attemptsUsed,
          });
        });
        return { status: 'cancelled' };
      }

      attemptsUsed = attempt;
      if (attemptResult.charged) chargeAttempts += 1;
      track({ chargeAttempts, attemptsUsed, request });

      if (attemptResult.kind === 'error') {
        lastError = { category: attemptResult.category, message: attemptResult.message };
        // Carry attempt-1 raw into repair attempt
        if (
          attemptResult.semanticFail &&
          'rawAssetId' in attemptResult &&
          typeof attemptResult.rawAssetId === 'string'
        ) {
          repairBaseAssetId = attemptResult.rawAssetId;
        }
        if (!attemptResult.retryable || attempt >= MAX_PROVIDER_ATTEMPTS) {
          break;
        }
        continue;
      }

      if (attemptResult.kind === 'image') {
        imageRawAssetId = attemptResult.rawAssetId;
        imageMime = attemptResult.mimeType;
        imageModelId = attemptResult.modelId;
        imageProvenance = attemptResult.provenance;
        lastError = null;
        break;
      }

      if (attemptResult.kind === 'text') {
        textResult = {
          value: attemptResult.value,
          modelId: attemptResult.modelId,
          profileId: attemptResult.profileId,
          provenance: attemptResult.provenance,
        };
        lastError = null;
        break;
      }
    }

    if (lastError || (!imageRawAssetId && !textResult)) {
      await step.do('fail-job', async () => {
        const per = creditsForRequest(request);
        await failJobTerminal(this.env, jobId, {
          chargedCredits: chargeAttempts * per,
          category: lastError?.category || 'internal',
          message: lastError?.message || PUBLIC_ERROR_MESSAGES.internal,
          attemptCount: attemptsUsed,
        });
      });
      return { status: 'failed' };
    }

    if (textResult && isTextOperation(request.operation)) {
      await step.do('save-text-result', async () => {
        const per = creditsForRequest(request);
        // Persist suggestions into store when applicable
        if (request.operation === 'suggestions.generate') {
          const suggestions = (textResult!.value as { suggestions?: string[] })?.suggestions || [];
          for (const text of suggestions) {
            try {
              await this.env.DB.prepare(
                `INSERT OR IGNORE INTO suggestions (text, serve_count, created_at) VALUES (?, 0, ?)`
              )
                .bind(text, Math.floor(Date.now() / 1000))
                .run();
            } catch {
              /* ignore duplicate */
            }
          }
        }
        await updateJob(this.env, jobId, {
          status: 'succeeded',
          stage: 'save',
          budgetState: 'settled',
          chargedCredits: chargeAttempts * per,
          attemptCount: attemptsUsed,
          resultJson: JSON.stringify(textResult!.value),
          completedAt: Date.now(),
        });
      });
      return { status: 'succeeded', kind: 'text' };
    }

    // Image: normalize from R2 raw, persist family, commit revision
    const persisted = await step.do('normalize-and-save', async () => {
      await updateJob(this.env, jobId, { stage: 'normalize' });
      const media = new MediaRepository(this.env);

      // Replay: if master already exists, reuse
      const existingMaster = await media.findMaster(jobId, attemptsUsed);
      if (existingMaster) {
        let revisionId: string | null = null;
        if (request.artworkId) {
          const worlds = new WorldsRepository(this.env);
          const rev = await worlds.commitRevision({
            artworkId: request.artworkId,
            parentRevisionId: request.parentRevisionId ?? null,
            mediaAssetId: existingMaster.id,
            sourceJobId: jobId,
            prompt: request.prompt ?? null,
            instruction: request.instruction ?? null,
            provenance: imageProvenance,
          });
          revisionId = rev.id;
          if (request.targetCardId) {
            const cards = new CardsRepository(this.env);
            await cards.commitArtRevision({
              cardId: request.targetCardId,
              expectedRevisionId: request.expectedCardRevisionId ?? null,
              artworkRevisionId: rev.id,
              sourceJobId: jobId,
            });
          }
        }
        await updateJob(this.env, jobId, {
          status: 'succeeded',
          stage: 'save',
          budgetState: 'settled',
          chargedCredits: chargeAttempts * creditsForRequest(request),
          attemptCount: attemptsUsed,
          resultAssetId: existingMaster.id,
          resultRevisionId: revisionId,
          completedAt: Date.now(),
        });
        return { masterAssetId: existingMaster.id, revisionId };
      }

      const rawAsset = imageRawAssetId
        ? await media.get(imageRawAssetId)
        : await media.findProviderRaw(jobId, attemptsUsed);
      if (!rawAsset) {
        throw new CreationError('internal', 'Missing provider raw asset', false, 500, true);
      }
      const bytes = await media.getBytes(rawAsset);
      const geometry = geometryForOperation(request.operation);

      let variants;
      try {
        variants = await normalizeImage(this.env.IMAGES, bytes, geometry);
      } catch (error) {
        const sanitized = sanitizeErrorMessage(error);
        throw new CreationError(
          'normalization_failed',
          sanitized.internalMessage,
          false,
          502,
          true
        );
      }

      const family = await media.persistNormalizedFamily({
        ownerId: job.ownerId,
        jobId,
        attempt: attemptsUsed,
        sourceModel: imageModelId,
        variants,
        existingRaw: rawAsset,
      });

      let revisionId: string | null = null;

      if (request.artworkId) {
        const worlds = new WorldsRepository(this.env);
        const revision = await worlds.commitRevision({
          artworkId: request.artworkId,
          parentRevisionId: request.parentRevisionId ?? null,
          mediaAssetId: family.master.id,
          sourceJobId: jobId,
          prompt: request.prompt ?? null,
          instruction: request.instruction ?? null,
          provenance: {
            ...imageProvenance,
            previewAssetId: family.preview.id,
            printAssetId: family.print?.id ?? null,
          },
        });
        revisionId = revision.id;

        if (request.targetCardId) {
          const cards = new CardsRepository(this.env);
          await cards.commitArtRevision({
            cardId: request.targetCardId,
            expectedRevisionId: request.expectedCardRevisionId ?? null,
            artworkRevisionId: revision.id,
            sourceJobId: jobId,
          });
        }
      }

      await updateJob(this.env, jobId, {
        status: 'succeeded',
        stage: 'save',
        budgetState: 'settled',
        chargedCredits: chargeAttempts * creditsForRequest(request),
        attemptCount: attemptsUsed,
        resultAssetId: family.master.id,
        resultRevisionId: revisionId,
        completedAt: Date.now(),
      });

      return {
        masterAssetId: family.master.id,
        previewAssetId: family.preview.id,
        revisionId,
      };
    });

    return { status: 'succeeded', kind: 'image', ...persisted };
  }
}
