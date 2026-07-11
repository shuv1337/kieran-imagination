import { describe, expect, it } from 'vitest';
import { handleCreateJob, handleListJobs } from '../../worker/jobs';
import { RECENT_TERMINAL_WINDOW_MS } from '../../shared/jobs';
import { openMigratedDb, mockEnv } from './d1-sqlite';

function jobRequest(body: unknown, idem: string, ip = '1.2.3.4') {
  return new Request('https://kieran.app/api/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idem,
      'cf-connecting-ip': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('handleCreateJob idempotency (production path)', () => {
  it('same key + same body returns one jobId', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const body = {
      operation: 'prompt.improve',
      quality: 'draft',
      prompt: 'a cat',
      inputs: [],
    };
    const a = await handleCreateJob(jobRequest(body, 'idem-1'), env, 'household');
    const b = await handleCreateJob(jobRequest(body, 'idem-1'), env, 'household');
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    const ja = (await a.json()) as { jobId: string };
    const jb = (await b.json()) as { jobId: string };
    expect(ja.jobId).toBe(jb.jobId);

    const count = await d1
      .prepare(`SELECT COUNT(*) as c FROM creation_jobs WHERE owner_id = 'household'`)
      .first<{ c: number }>();
    expect(count?.c).toBe(1);
  });

  it('same key + different body returns 409', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const a = await handleCreateJob(
      jobRequest(
        { operation: 'prompt.improve', quality: 'draft', prompt: 'cat', inputs: [] },
        'idem-2'
      ),
      env,
      'household'
    );
    expect(a.status).toBe(202);
    const b = await handleCreateJob(
      jobRequest(
        { operation: 'prompt.improve', quality: 'draft', prompt: 'dog', inputs: [] },
        'idem-2'
      ),
      env,
      'household'
    );
    expect(b.status).toBe(409);
  });

  it('rejects invalid input before reserve', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const res = await handleCreateJob(
      jobRequest(
        { operation: 'coloring.generate', quality: 'draft', inputs: [] },
        'idem-bad'
      ),
      env,
      'household'
    );
    expect(res.status).toBe(400);
    const count = await d1
      .prepare(`SELECT COUNT(*) as c FROM creation_jobs`)
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
  });

  it('listJobs active includes recent terminal jobs and excludes old terminals', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const oldCompleted = now - RECENT_TERMINAL_WINDOW_MS - 60_000;
    await d1
      .prepare(
        `INSERT INTO daily_budgets (owner_id, day, credit_limit, reserved, used) VALUES ('household', ?, 40, 0, 0)`
      )
      .bind(day)
      .run();
    await d1
      .prepare(
        `INSERT INTO creation_jobs
         (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
          status, stage, attempt_count, reserved_credits, charged_credits, budget_state,
          created_at, updated_at, completed_at)
         VALUES ('term1', 'household', 'k-term', 'h', 'prompt.improve', 'draft',
          '{"operation":"prompt.improve","quality":"draft","inputs":[],"worldId":"w1"}',
          'succeeded', 'save', 1, 0, 1, 'settled', ?, ?, ?)`
      )
      .bind(now, now, now)
      .run();
    await d1
      .prepare(
        `INSERT INTO creation_jobs
         (id, owner_id, idempotency_key, request_hash, operation, quality, request_json,
          status, stage, attempt_count, reserved_credits, charged_credits, budget_state,
          created_at, updated_at, completed_at)
         VALUES ('term-old', 'household', 'k-old', 'h2', 'prompt.improve', 'draft',
          '{"operation":"prompt.improve","quality":"draft","inputs":[],"worldId":"w1"}',
          'succeeded', 'save', 1, 0, 1, 'settled', ?, ?, ?)`
      )
      .bind(oldCompleted, oldCompleted, oldCompleted)
      .run();

    const req = new Request(`https://kieran.app/api/jobs?worldId=w1&active=true`);
    const res = await handleListJobs(req, env, 'household');
    const data = (await res.json()) as { jobs: Array<{ id: string }> };
    const ids = data.jobs.map((j) => j.id);
    expect(ids).toContain('term1');
    expect(ids).not.toContain('term-old');
  });
});
