import type { CreationRequest, FailureCategory } from './creation';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobStage = 'input' | 'model' | 'normalize' | 'save';
export type BudgetState = 'reserved' | 'settled' | 'released';

export interface CreationJobRecord {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  requestHash: string;
  operation: string;
  quality: string;
  requestJson: CreationRequest;
  status: JobStatus;
  stage: JobStage;
  attemptCount: number;
  reservedCredits: number;
  chargedCredits: number;
  budgetState: BudgetState;
  cancelRequestedAt: number | null;
  resultAssetId: string | null;
  resultRevisionId: string | null;
  targetCardId: string | null;
  expectedCardRevisionId: string | null;
  resultJson: unknown | null;
  errorCategory: FailureCategory | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface JobAcceptedResponse {
  jobId: string;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  stage: JobStage;
  operation: string;
  quality: string;
  attemptCount: number;
  resultAssetId?: string | null;
  resultRevisionId?: string | null;
  resultJson?: unknown | null;
  errorCategory?: FailureCategory | null;
  errorMessage?: string | null;
  cancelRequestedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
  worldId?: string | null;
  artworkId?: string | null;
}

export function toJobStatusResponse(row: CreationJobRecord): JobStatusResponse {
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    operation: row.operation,
    quality: row.quality,
    attemptCount: row.attemptCount,
    resultAssetId: row.resultAssetId,
    resultRevisionId: row.resultRevisionId,
    resultJson: row.resultJson,
    errorCategory: row.errorCategory,
    errorMessage: row.errorMessage,
    cancelRequestedAt: row.cancelRequestedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    worldId: row.requestJson.worldId ?? null,
    artworkId: row.requestJson.artworkId ?? null,
  };
}

/** Include recent terminal jobs when restoring a world after refresh. */
export const RECENT_TERMINAL_WINDOW_MS = 15 * 60 * 1000;

export const ACTIVE_JOB_STATUSES: JobStatus[] = ['queued', 'running'];
