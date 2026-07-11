import type { CreationRequest } from '../shared/creation';
import type { JobStatusResponse } from '../shared/jobs';
import { apiFetch } from './api';

export async function createJob(
  request: CreationRequest,
  idempotencyKey?: string
): Promise<{ jobId: string }> {
  return apiFetch('/api/jobs', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey || crypto.randomUUID(),
    },
    body: JSON.stringify(request),
  });
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  return apiFetch(`/api/jobs/${jobId}`);
}

export async function listJobs(params?: {
  worldId?: string;
  active?: boolean;
}): Promise<{ jobs: JobStatusResponse[] }> {
  const q = new URLSearchParams();
  if (params?.worldId) q.set('worldId', params.worldId);
  if (params?.active) q.set('active', 'true');
  const qs = q.toString();
  return apiFetch(`/api/jobs${qs ? `?${qs}` : ''}`);
}

export async function cancelJob(jobId: string): Promise<JobStatusResponse> {
  return apiFetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
}

export async function uploadFile(file: Blob, fileName = 'upload.png'): Promise<{
  assetId: string;
  url: string;
  width: number | null;
  height: number | null;
}> {
  const form = new FormData();
  form.append('file', file, fileName);
  return apiFetch('/api/uploads', { method: 'POST', body: form });
}

export function assetUrl(assetId: string): string {
  return `/api/assets/${assetId}`;
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export async function pollJob(
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onUpdate?: (job: JobStatusResponse) => void;
    signal?: AbortSignal;
  } = {}
): Promise<JobStatusResponse> {
  const intervalMs = options.intervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();

  while (true) {
    if (options.signal?.aborted) {
      throw new Error('Polling aborted');
    }
    const job = await getJob(jobId);
    options.onUpdate?.(job);
    if (TERMINAL.has(job.status)) {
      return job;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Job polling timed out');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** High-level: submit job and wait for result. */
export async function runCreationJob(
  request: CreationRequest,
  options?: Parameters<typeof pollJob>[1] & { idempotencyKey?: string }
): Promise<JobStatusResponse> {
  const { jobId } = await createJob(request, options?.idempotencyKey);
  return pollJob(jobId, options);
}
