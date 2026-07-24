import { describe, expect, it } from 'vitest';
import {
  GUEST_OWNER_ID,
  resolveOwnerId,
  SESSION_COOKIE,
  signSession,
  verifySession,
} from '../../worker/auth';
import type { Env } from '../../worker/env';

function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: {} as Fetcher,
    IMAGES_BUCKET: {} as R2Bucket,
    DB: {} as D1Database,
    CREATION_WORKFLOW: {} as Workflow,
    GEMINI_API_KEY: 'test',
    FAMILY_ACCESS_CODE: 'family-secret',
    SESSION_SIGNING_KEY: 'signing-key-for-tests-32chars!!',
    ...overrides,
  };
}

describe('household session auth', () => {
  it('signs and verifies a session cookie token', async () => {
    const env = mockEnv();
    const token = await signSession(env, 'household');
    const session = await verifySession(env, token);
    expect(session?.ownerId).toBe('household');
    expect(session?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects tampered tokens', async () => {
    const env = mockEnv();
    const token = await signSession(env, 'household');
    const bad = token.slice(0, -4) + 'xxxx';
    const session = await verifySession(env, bad);
    expect(session).toBeNull();
  });

  it('rejects wrong signing key', async () => {
    const env = mockEnv();
    const token = await signSession(env, 'household');
    const other = mockEnv({ SESSION_SIGNING_KEY: 'different-key-for-tests-32chars!' });
    expect(await verifySession(other, token)).toBeNull();
  });

  it('resolveOwnerId isolates browser guests and returns household when logged in', async () => {
    const env = mockEnv();
    const anon = await resolveOwnerId(new Request('https://kieran.app/api/worlds'), env);
    expect(anon).toBe(GUEST_OWNER_ID);

    const browserGuest = await resolveOwnerId(
      new Request('https://kieran.app/api/worlds', {
        headers: { 'X-Kieran-Guest-Id': '550e8400-e29b-41d4-a716-446655440000' },
      }),
      env
    );
    expect(browserGuest).toBe('guest:550e8400-e29b-41d4-a716-446655440000');

    const token = await signSession(env, 'household');
    const loggedIn = await resolveOwnerId(
      new Request('https://kieran.app/api/worlds', {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      }),
      env
    );
    expect(loggedIn).toBe('household');
  });
});
