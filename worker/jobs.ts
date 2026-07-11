import {
  maxReservedCredits,
  stableRequestHash,
  type CreationRequest,
} from '../shared/creation';
import { parseAndValidateCreationRequest } from '../shared/validate';
import {
  RECENT_TERMINAL_WINDOW_MS,
  toJobStatusResponse,
  type CreationJobRecord,
  type JobStatus,
} from '../shared/jobs';
import { PUBLIC_ERROR_MESSAGES } from '../server/creation/errors';
import { dailyCreditLimit, type Env } from './env';

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mapJob(row: Record<string, unknown>): CreationJobRecord {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    idempotencyKey: row.idempotency_key as string,
    requestHash: row.request_hash as string,
    operation: row.operation as string,
    quality: row.quality as string,
    requestJson: JSON.parse(row.request_json as string) as CreationRequest,
    status: row.status as JobStatus,
    stage: row.stage as CreationJobRecord['stage'],
    attemptCount: row.attempt_count as number,
    reservedCredits: row.reserved_credits as number,
    chargedCredits: row.charged_credits as number,
    budgetState: row.budget_state as CreationJobRecord['budgetState'],
    cancelRequestedAt: (row.cancel_requested_at as number) ?? null,
    resultAssetId: (row.result_asset_id as string) ?? null,
    resultRevisionId: (row.result_revision_id as string) ?? null,
    targetCardId: (row.target_card_id as string) ?? null,
    expectedCardRevisionId: (row.expected_card_revision_id as string) ?? null,
    resultJson: row.result_json ? JSON.parse(row.result_json as string) : null,
    errorCategory: (row.error_category as CreationJobRecord['errorCategory']) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    completedAt: (row.completed_at as number) ?? null,
  };
}

export async function getJob(env: Env, jobId: string): Promise<CreationJobRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM creation_jobs WHERE id = ?`).bind(jobId).first();
  return row ? mapJob(row as Record<string, unknown>) : null;
}

/**
 * Update job fields. When budgetState transitions to settled/released,
 * only applies if current budget_state is still 'reserved' (replay-safe).
 * Returns whether a row was updated.
 */
export async function updateJob(
  env: Env,
  jobId: string,
  fields: Partial<{
    status: string;
    stage: string;
    attemptCount: number;
    chargedCredits: number;
    budgetState: string;
    resultAssetId: string | null;
    resultRevisionId: string | null;
    resultJson: string | null;
    errorCategory: string | null;
    errorMessage: string | null;
    completedAt: number | null;
    cancelRequestedAt: number | null;
  }>
): Promise<{ changes: number }> {
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  const map: Record<string, string> = {
    status: 'status',
    stage: 'stage',
    attemptCount: 'attempt_count',
    chargedCredits: 'charged_credits',
    budgetState: 'budget_state',
    resultAssetId: 'result_asset_id',
    resultRevisionId: 'result_revision_id',
    resultJson: 'result_json',
    errorCategory: 'error_category',
    errorMessage: 'error_message',
    completedAt: 'completed_at',
    cancelRequestedAt: 'cancel_requested_at',
  };

  for (const [k, col] of Object.entries(map)) {
    if (k in fields) {
      sets.push(`${col} = ?`);
      values.push((fields as Record<string, unknown>)[k]);
    }
  }

  const settling =
    fields.budgetState === 'settled' || fields.budgetState === 'released';

  if (settling) {
    values.push(jobId);
    const result = await env.DB.prepare(
      `UPDATE creation_jobs SET ${sets.join(', ')}
       WHERE id = ? AND budget_state = 'reserved'`
    )
      .bind(...values)
      .run();
    // If already settled, still allow non-budget fields on terminal status
    if ((result.meta?.changes ?? 0) === 0 && fields.status) {
      const fallbackSets = ['updated_at = ?', 'status = ?'];
      const fallbackVals: unknown[] = [Date.now(), fields.status];
      if (fields.errorCategory) {
        fallbackSets.push('error_category = ?');
        fallbackVals.push(fields.errorCategory);
      }
      if (fields.errorMessage) {
        fallbackSets.push('error_message = ?');
        fallbackVals.push(fields.errorMessage);
      }
      if (fields.completedAt != null) {
        fallbackSets.push('completed_at = ?');
        fallbackVals.push(fields.completedAt);
      }
      if (fields.resultAssetId !== undefined) {
        fallbackSets.push('result_asset_id = ?');
        fallbackVals.push(fields.resultAssetId);
      }
      if (fields.resultRevisionId !== undefined) {
        fallbackSets.push('result_revision_id = ?');
        fallbackVals.push(fields.resultRevisionId);
      }
      if (fields.resultJson !== undefined) {
        fallbackSets.push('result_json = ?');
        fallbackVals.push(fields.resultJson);
      }
      if (fields.stage) {
        fallbackSets.push('stage = ?');
        fallbackVals.push(fields.stage);
      }
      if (fields.attemptCount != null) {
        fallbackSets.push('attempt_count = ?');
        fallbackVals.push(fields.attemptCount);
      }
      fallbackVals.push(jobId);
      await env.DB.prepare(
        `UPDATE creation_jobs SET ${fallbackSets.join(', ')}
         WHERE id = ? AND status NOT IN ('succeeded', 'failed', 'cancelled')`
      )
        .bind(...fallbackVals)
        .run();
    }
    return { changes: result.meta?.changes ?? 0 };
  }

  values.push(jobId);
  const result = await env.DB.prepare(`UPDATE creation_jobs SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
  return { changes: result.meta?.changes ?? 0 };
}

/** Terminal failure helper — always settles or releases reserved credits. */
export async function failJobTerminal(
  env: Env,
  jobId: string,
  opts: {
    chargedCredits: number;
    category: string;
    message: string;
    attemptCount?: number;
    status?: 'failed' | 'cancelled';
  }
): Promise<void> {
  const job = await getJob(env, jobId);
  if (!job) return;
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
    if (job.budgetState === 'reserved') {
      // Stuck reserved after terminal status — force settle
      await updateJob(env, jobId, {
        budgetState: opts.chargedCredits > 0 ? 'settled' : 'released',
        chargedCredits: opts.chargedCredits,
      });
    }
    return;
  }

  const budgetState = opts.chargedCredits > 0 ? 'settled' : 'released';
  await updateJob(env, jobId, {
    status: opts.status || 'failed',
    budgetState,
    chargedCredits: opts.chargedCredits,
    attemptCount: opts.attemptCount,
    errorCategory: opts.category,
    errorMessage: opts.message,
    completedAt: Date.now(),
  });
}

function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function nextUtcMidnightIso(from = Date.now()): string {
  const d = new Date(from);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(next).toISOString();
}

export async function handleCreateJob(
  request: Request,
  env: Env,
  ownerId: string
): Promise<Response> {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey) {
    return json({ error: 'Idempotency-Key header is required' }, 400);
  }

  if (env.APP_RATE_LIMITER) {
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      ownerId;
    const { success } = await env.APP_RATE_LIMITER.limit({ key: `jobs:${ip}` });
    if (!success) {
      return json({ error: 'Too many requests. Please slow down.' }, 429);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Validate BEFORE any credit reservation
  const parsed = parseAndValidateCreationRequest(body);
  if (parsed.ok === false) {
    return json({ error: parsed.error }, 400);
  }
  const creationRequest = parsed.request;

  const requestHash = await hashString(stableRequestHash(creationRequest));

  const existing = await env.DB.prepare(
    `SELECT * FROM creation_jobs WHERE owner_id = ? AND idempotency_key = ?`
  )
    .bind(ownerId, idempotencyKey)
    .first();

  if (existing) {
    const job = mapJob(existing as Record<string, unknown>);
    if (job.requestHash !== requestHash) {
      return json({ error: 'Idempotency key reuse with different request' }, 409);
    }
    return json({ jobId: job.id }, 202);
  }

  // Verify input assets exist and are owned before reserve
  for (const input of creationRequest.inputs) {
    const row = await env.DB.prepare(
      `SELECT id, owner_id FROM media_assets WHERE id = ?`
    )
      .bind(input.assetId)
      .first<{ id: string; owner_id: string }>();
    if (!row || row.owner_id !== ownerId) {
      return json({ error: `Invalid or unauthorized input asset: ${input.role}` }, 400);
    }
  }

  const now = Date.now();
  const day = utcDay(now);
  const limit = dailyCreditLimit(env);
  const reserved = maxReservedCredits(creationRequest);
  const jobId = crypto.randomUUID();

  try {
    // Atomic batch: ensure budget row + insert job (trigger reserves)
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO daily_budgets (owner_id, day, credit_limit, reserved, used)
         VALUES (?, ?, ?, 0, 0)`
      ).bind(ownerId, day, limit),
      env.DB.prepare(
        `INSERT INTO creation_jobs
         (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
          status, stage, attempt_count, reserved_credits, charged_credits, budget_state,
          cancel_requested_at, result_asset_id, result_revision_id, target_card_id,
          expected_card_revision_id, result_json, error_category, error_message,
          created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'input', 0, ?, 0, 'reserved',
          NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, ?, NULL)`
      ).bind(
        jobId,
        ownerId,
        idempotencyKey,
        requestHash,
        creationRequest.operation,
        creationRequest.quality,
        JSON.stringify(creationRequest),
        reserved,
        creationRequest.targetCardId ?? null,
        creationRequest.expectedCardRevisionId ?? null,
        now,
        now
      ),
    ]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('budget_exceeded') || msg.includes('ABORT') || msg.includes('budget_missing')) {
      return json(
        {
          error: PUBLIC_ERROR_MESSAGES.budget_exceeded,
          category: 'budget_exceeded',
          resetsAt: nextUtcMidnightIso(now),
        },
        429
      );
    }
    if (msg.toLowerCase().includes('unique')) {
      const raced = await env.DB.prepare(
        `SELECT * FROM creation_jobs WHERE owner_id = ? AND idempotency_key = ?`
      )
        .bind(ownerId, idempotencyKey)
        .first();
      if (raced) {
        const job = mapJob(raced as Record<string, unknown>);
        if (job.requestHash !== requestHash) {
          return json({ error: 'Idempotency key reuse with different request' }, 409);
        }
        return json({ jobId: job.id }, 202);
      }
    }
    console.error(JSON.stringify({ scope: 'create-job', error: msg }));
    return json({ error: 'Failed to create job' }, 500);
  }

  try {
    await env.CREATION_WORKFLOW.create({ id: jobId, params: { jobId } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.toLowerCase().includes('already')) {
      console.error(JSON.stringify({ scope: 'workflow-create', jobId, error: msg }));
    }
  }

  return json({ jobId }, 202);
}

export async function handleGetJob(
  env: Env,
  ownerId: string,
  jobId: string
): Promise<Response> {
  const job = await getJob(env, jobId);
  if (!job || job.ownerId !== ownerId) {
    return json({ error: 'Not found' }, 404);
  }
  return json(toJobStatusResponse(job));
}

export async function handleListJobs(
  request: Request,
  env: Env,
  ownerId: string
): Promise<Response> {
  const url = new URL(request.url);
  const worldId = url.searchParams.get('worldId');
  const active = url.searchParams.get('active') === 'true';

  let sql = `SELECT * FROM creation_jobs WHERE owner_id = ?`;
  const binds: unknown[] = [ownerId];

  if (worldId) {
    sql += ` AND json_extract(request_json, '$.worldId') = ?`;
    binds.push(worldId);
  }
  if (active) {
    // Active + recently completed (for restore after refresh)
    const since = Date.now() - RECENT_TERMINAL_WINDOW_MS;
    sql += ` AND (status IN ('queued', 'running') OR (status IN ('succeeded', 'failed', 'cancelled') AND completed_at >= ?))`;
    binds.push(since);
  }
  sql += ` ORDER BY created_at DESC LIMIT 50`;

  const res = await env.DB.prepare(sql)
    .bind(...binds)
    .all();
  const jobs = (res.results || []).map((r) =>
    toJobStatusResponse(mapJob(r as Record<string, unknown>))
  );
  return json({ jobs });
}

export async function handleCancelJob(env: Env, ownerId: string, jobId: string): Promise<Response> {
  const job = await getJob(env, jobId);
  if (!job || job.ownerId !== ownerId) {
    return json({ error: 'Not found' }, 404);
  }
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
    return json(toJobStatusResponse(job));
  }

  const now = Date.now();

  // Immediate cancel+release for never-started jobs
  if (job.status === 'queued' && job.attemptCount === 0) {
    await updateJob(env, jobId, {
      cancelRequestedAt: now,
      status: 'cancelled',
      budgetState: 'released',
      chargedCredits: 0,
      errorCategory: 'cancelled',
      errorMessage: PUBLIC_ERROR_MESSAGES.cancelled,
      completedAt: now,
    });
    const updated = await getJob(env, jobId);
    return json(toJobStatusResponse(updated!));
  }

  // Mid-flight: cooperative cancel flag for Workflow
  await updateJob(env, jobId, { cancelRequestedAt: now });
  const updated = await getJob(env, jobId);
  return json(toJobStatusResponse(updated!));
}

export async function repairStaleJobs(env: Env): Promise<void> {
  // 1) Recreate missing workflows for never-started queued jobs
  const queued = await env.DB.prepare(
    `SELECT id FROM creation_jobs
     WHERE status = 'queued'
       AND attempt_count = 0
       AND created_at < ?
     LIMIT 20`
  )
    .bind(Date.now() - 2 * 60 * 1000)
    .all();

  for (const row of queued.results || []) {
    const jobId = (row as { id: string }).id;
    try {
      await env.CREATION_WORKFLOW.create({ id: jobId, params: { jobId } });
      console.log(JSON.stringify({ scope: 'stale-job-repair', jobId, action: 'workflow-created' }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.toLowerCase().includes('already')) {
        console.error(JSON.stringify({ scope: 'stale-job-repair', jobId, error: msg }));
      }
    }
  }

  // 2) Cancel-requested + still queued with no attempts → release immediately
  const cancelQueued = await env.DB.prepare(
    `SELECT id FROM creation_jobs
     WHERE status = 'queued'
       AND attempt_count = 0
       AND cancel_requested_at IS NOT NULL
       AND budget_state = 'reserved'
     LIMIT 20`
  ).all();

  for (const row of cancelQueued.results || []) {
    const jobId = (row as { id: string }).id;
    await failJobTerminal(env, jobId, {
      chargedCredits: 0,
      category: 'cancelled',
      message: PUBLIC_ERROR_MESSAGES.cancelled,
      status: 'cancelled',
      attemptCount: 0,
    });
  }

  // 3) Extremely old running jobs with reserved budget and no progress — only when
  // attempt_count=0 (never contacted provider). Never release mid-provider by age alone.
  const stuck = await env.DB.prepare(
    `SELECT id FROM creation_jobs
     WHERE status = 'running'
       AND attempt_count = 0
       AND budget_state = 'reserved'
       AND updated_at < ?
     LIMIT 10`
  )
    .bind(Date.now() - 30 * 60 * 1000)
    .all();

  for (const row of stuck.results || []) {
    const jobId = (row as { id: string }).id;
    try {
      await env.CREATION_WORKFLOW.create({ id: jobId, params: { jobId } });
      console.log(
        JSON.stringify({ scope: 'stale-job-repair', jobId, action: 'workflow-created-stuck' })
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Live workflow still exists — do not fail-release reserved credits
      if (msg.toLowerCase().includes('already')) {
        console.log(
          JSON.stringify({ scope: 'stale-job-repair', jobId, action: 'workflow-already-exists' })
        );
        continue;
      }
      // Create truly failed and never started provider — fail-release
      console.error(JSON.stringify({ scope: 'stale-job-repair', jobId, error: msg }));
      await failJobTerminal(env, jobId, {
        chargedCredits: 0,
        category: 'internal',
        message: PUBLIC_ERROR_MESSAGES.internal,
        attemptCount: 0,
      });
    }
  }
}

/** Shared accept path for card helpers and tests — rate limit + validate + reserve. */
export async function acceptCreationJob(
  env: Env,
  ownerId: string,
  creationRequest: CreationRequest,
  opts: { idempotencyKey: string; clientIp?: string }
): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Idempotency-Key': opts.idempotencyKey,
  });
  if (opts.clientIp) {
    headers.set('cf-connecting-ip', opts.clientIp);
  }
  const request = new Request('https://kieran.app/api/jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify(creationRequest),
  });
  return handleCreateJob(request, env, ownerId);
}

async function hashString(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
