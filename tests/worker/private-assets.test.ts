import { describe, expect, it } from 'vitest';
import { handleGetAsset } from '../../worker/uploads';
import { handleRequest } from '../../worker/router';
import { openMigratedDb, mockEnv } from './d1-sqlite';

describe('private media asset isolation (behavioral)', () => {
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

  it('Hot or Not API is retired', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    for (const method of ['GET', 'POST']) {
      const res = await handleRequest(
        new Request('https://kieran.app/api/hot', { method }),
        env,
        {} as ExecutionContext
      );
      expect(res.status).toBe(404);
    }
  });
});
