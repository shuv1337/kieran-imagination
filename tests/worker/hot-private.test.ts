import { describe, expect, it } from 'vitest';
import { handleGetAsset } from '../../worker/uploads';
import { handleHot } from '../../worker/router';
import { openMigratedDb, mockEnv } from './d1-sqlite';
import { signSession, SESSION_COOKIE } from '../../worker/auth';

describe('Hot or Not private isolation (behavioral)', () => {
  it('private media_assets are 403 without session owner', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('priv1', 'household', 'master', 'private', 'image/png', 1, 1, 3, 'x', 'jobs/j/a1/master.png', ?)`
      )
      .bind(Date.now())
      .run();
    await env.IMAGES_BUCKET.put('jobs/j/a1/master.png', new Uint8Array([1, 2, 3]));

    const req = new Request('https://kieran.app/api/assets/priv1');
    const res = await handleGetAsset(req, env, 'priv1', null);
    expect(res.status).toBe(403);
  });

  it('private media is 200 for owning household session', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('priv2', 'household', 'master', 'private', 'image/png', 1, 1, 3, 'x', 'jobs/j/a2/master.png', ?)`
      )
      .bind(Date.now())
      .run();
    await env.IMAGES_BUCKET.put('jobs/j/a2/master.png', new Uint8Array([9, 9, 9]));

    const req = new Request('https://kieran.app/api/assets/priv2');
    const res = await handleGetAsset(req, env, 'priv2', 'household');
    expect(res.status).toBe(200);
  });

  it('public visibility streams without owner', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('pub1', 'household', 'master', 'public', 'image/png', 1, 1, 3, 'x', 'jobs/j/a3/master.png', ?)`
      )
      .bind(Date.now())
      .run();
    await env.IMAGES_BUCKET.put('jobs/j/a3/master.png', new Uint8Array([4, 5, 6]));

    const res = await handleGetAsset(
      new Request('https://kieran.app/api/assets/pub1'),
      env,
      'pub1',
      null
    );
    expect(res.status).toBe(200);
  });

  it('hot list requires login', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const res = await handleHot(
      new Request('https://kieran.app/api/hot?limit=50&offset=0'),
      env
    );
    expect(res.status).toBe(401);
  });

  it('hot list only returns legacy generated_images, never private media_assets', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const now = Date.now();

    await d1
      .prepare(
        `INSERT INTO generated_images (id, file_name, prompt, r2_key, created_at, source, metadata)
         VALUES ('legacy-hot', 'a.png', 'a cat', 'generated/2026/a.png', ?, 'generate', '{}')`
      )
      .bind(now)
      .run();

    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('world-private', 'household', 'master', 'private', 'image/png', 10, 10, 3, 'h', 'jobs/x/master.png', ?)`
      )
      .bind(now)
      .run();

    const token = await signSession(env, 'household');
    const res = await handleHot(
      new Request('https://kieran.app/api/hot?limit=50&offset=0', {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      }),
      env
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { images: Array<{ id: string }> };
    const ids = data.images.map((i) => i.id);
    expect(ids).toContain('legacy-hot');
    expect(ids).not.toContain('world-private');
  });
});
