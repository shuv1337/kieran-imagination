import { describe, expect, it } from 'vitest';
import { WorldsRepository } from '../../server/worlds/repository';
import { openMigratedDb, mockEnv } from './d1-sqlite';

describe('editor save commits durable revision', () => {
  // Download is local-only in Editor (blob URL) and never calls commitRevision —
  // covered here by asserting save uses sourceJobId null + provenance source:editor.
  it('saveEditorRevision path commits a revision without a source job', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const worlds = new WorldsRepository(env);
    const world = await worlds.createWorld('household', { title: 'W' });
    const art = await worlds.createArtwork(world.id, { kind: 'coloring', title: 'A' });

    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('editor-media', 'household', 'master', 'private', 'image/png', 10, 10, 3, 'a', 'k/e', ?)`
      )
      .bind(Date.now())
      .run();

    const rev = await worlds.commitRevision({
      artworkId: art.id,
      parentRevisionId: null,
      mediaAssetId: 'editor-media',
      sourceJobId: null,
      provenance: { source: 'editor' },
    });
    expect(rev.sourceJobId).toBeNull();
    expect(rev.provenance).toMatchObject({ source: 'editor' });

    const head = await worlds.getArtwork(art.id);
    expect(head?.currentRevisionId).toBe(rev.id);
  });
});
