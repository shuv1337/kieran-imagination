import { describe, expect, it } from 'vitest';
import { handleRequest } from '../../worker/router';
import { mockEnv, openMigratedDb } from './d1-sqlite';

function capturingCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;
  return { ctx, flush: () => Promise.all(pending) };
}

describe('request logging', () => {
  it('records API calls for the admin dashboard but skips asset streams and job polling', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const { ctx, flush } = capturingCtx();
    const headers = { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'test-agent' };

    await handleRequest(new Request('https://kieran.app/api/session', { headers }), env, ctx);
    await handleRequest(new Request('https://kieran.app/api/assets/nope', { headers }), env, ctx);
    await handleRequest(new Request('https://kieran.app/api/jobs/job-1', { headers }), env, ctx);
    await flush();

    const rows = await d1
      .prepare('SELECT endpoint, method, status_code, ip_address, user_agent FROM request_logs')
      .all<{ endpoint: string; method: string; status_code: number; ip_address: string; user_agent: string }>();
    expect(rows.results).toEqual([
      { endpoint: '/api/session', method: 'GET', status_code: 200, ip_address: '203.0.113.7', user_agent: 'test-agent' },
    ]);
  });
});
