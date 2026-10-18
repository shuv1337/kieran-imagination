import { describe, expect, it } from 'vitest';
import { handleRequest } from '../../worker/router';
import { GUEST_COOKIE, resolveOwnerId, SESSION_COOKIE, signSession } from '../../worker/auth';
import { MediaRepository } from '../../server/media/repository';
import { mockEnv, openMigratedDb } from './d1-sqlite';

const guestId = '550e8400-e29b-41d4-a716-446655440000';
const otherGuestId = '550e8400-e29b-41d4-a716-446655440001';
const ctx = {} as ExecutionContext;

describe('guest image requests', () => {
  it('bridges existing API identity into a cookie for native image and download requests', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const asset = await new MediaRepository(env).putAsset({
      ownerId: `guest:${guestId}`,
      role: 'master',
      bytes,
      mimeType: 'image/png',
      r2Key: 'jobs/guest-test/a1/master.png',
    });
    const url = `https://kieran.app/api/assets/${asset.id}`;
    expect((await handleRequest(new Request(url), env, ctx)).status).toBe(403);

    const session = await handleRequest(new Request('https://kieran.app/api/session', {
      headers: { 'X-Kieran-Guest-Id': guestId },
    }), env, ctx);
    const setCookie = session.headers.get('Set-Cookie')!;
    expect(setCookie).toContain(`${GUEST_COOKIE}=${guestId}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
    expect(session.headers.get('Cache-Control')).toBe('private, no-store');

    // An <img>, canvas image, or plain fetch sends cookies but no custom header.
    const image = await handleRequest(new Request(url, {
      headers: { Cookie: setCookie.split(';')[0] },
    }), env, ctx);
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);

    for (const cookie of [`${GUEST_COOKIE}=${otherGuestId}`, `${GUEST_COOKIE}=household`, `${GUEST_COOKIE}=%ZZ`]) {
      expect((await handleRequest(new Request(url, {
        headers: { Cookie: cookie },
      }), env, ctx)).status).toBe(403);
    }
  });

  it('keeps household sessions authoritative and lets explicit guest headers replace stale cookies', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const token = await signSession(env, 'household');
    expect(await resolveOwnerId(new Request('https://kieran.app/api/worlds', {
      headers: { Cookie: `${SESSION_COOKIE}=${token}; ${GUEST_COOKIE}=${guestId}` },
    }), env)).toBe('household');

    const request = new Request('https://kieran.app/api/session', {
      headers: { Cookie: `${GUEST_COOKIE}=${otherGuestId}`, 'X-Kieran-Guest-Id': guestId },
    });
    expect(await resolveOwnerId(request, env)).toBe(`guest:${guestId}`);
    expect((await handleRequest(request, env, ctx)).headers.get('Set-Cookie'))
      .toContain(`${GUEST_COOKIE}=${guestId}`);
  });
});
