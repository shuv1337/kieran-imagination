import { describe, expect, it } from 'vitest';
import { WorldsRepository } from '../../server/worlds/repository';
import { CardsRepository } from '../../server/cards/repository';
import { defaultCardDocument } from '../../shared/cards';
import { openMigratedDb, mockEnv } from './d1-sqlite';

describe('production repository revision uniqueness', () => {
  it('commitRevision is idempotent on source_job_id', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const worlds = new WorldsRepository(env);

    const world = await worlds.createWorld('household', { title: 'W' });
    const art = await worlds.createArtwork(world.id, { kind: 'coloring', title: 'A' });

    // Seed a media asset row the revision can reference
    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('media1', 'household', 'master', 'private', 'image/png', 10, 10, 3, 'abc', 'k/media1', ?)`
      )
      .bind(Date.now())
      .run();

    const a = await worlds.commitRevision({
      artworkId: art.id,
      parentRevisionId: null,
      mediaAssetId: 'media1',
      sourceJobId: 'job-1',
      prompt: 'cat',
    });
    const b = await worlds.commitRevision({
      artworkId: art.id,
      parentRevisionId: null,
      mediaAssetId: 'media1',
      sourceJobId: 'job-1',
      prompt: 'cat',
    });
    expect(a.id).toBe(b.id);

    const rows = await d1
      .prepare(`SELECT COUNT(*) as c FROM artwork_revisions WHERE artwork_id = ?`)
      .bind(art.id)
      .first<{ c: number }>();
    expect(rows?.c).toBe(1);
  });

  it('null-parent CAS leaves concurrent second revision as branch', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const worlds = new WorldsRepository(env);
    const world = await worlds.createWorld('household', { title: 'W' });
    const art = await worlds.createArtwork(world.id, { kind: 'coloring', title: 'A' });

    for (const id of ['m1', 'm2']) {
      await d1
        .prepare(
          `INSERT INTO media_assets
           (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
           VALUES (?, 'household', 'master', 'private', 'image/png', 10, 10, 3, 'abc', ?, ?)`
        )
        .bind(id, `k/${id}`, Date.now())
        .run();
    }

    const first = await worlds.commitRevision({
      artworkId: art.id,
      parentRevisionId: null,
      mediaAssetId: 'm1',
      sourceJobId: 'job-a',
    });
    const second = await worlds.commitRevision({
      artworkId: art.id,
      parentRevisionId: null,
      mediaAssetId: 'm2',
      sourceJobId: 'job-b',
    });
    expect(first.id).not.toBe(second.id);

    const head = await worlds.getArtwork(art.id);
    expect(head?.currentRevisionId).toBe(first.id);

    const count = await d1
      .prepare(`SELECT COUNT(*) as c FROM artwork_revisions WHERE artwork_id = ?`)
      .bind(art.id)
      .first<{ c: number }>();
    expect(count?.c).toBe(2);
  });

  it('commitArtRevision preserves document fields and is job-idempotent', async () => {
    const { d1 } = openMigratedDb();
    const env = mockEnv(d1);
    const worlds = new WorldsRepository(env);
    const cards = new CardsRepository(env);

    const world = await worlds.createWorld('household', { title: 'W' });
    const doc = defaultCardDocument('Sparkfox');
    doc.flavorText = 'Brave';
    doc.presentation.rarity = 'legendary';
    const { card, revision: parent } = await cards.create(world.id, {
      title: 'Sparkfox',
      document: doc,
    });

    await d1
      .prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key, created_at)
         VALUES ('media-art', 'household', 'master', 'private', 'image/png', 10, 10, 3, 'abc', 'k/art', ?)`
      )
      .bind(Date.now())
      .run();

    const art = await worlds.createArtwork(world.id, { kind: 'card-art', title: 'Art' });
    const artRev = await worlds.commitRevision({
      artworkId: art.id,
      parentRevisionId: null,
      mediaAssetId: 'media-art',
      sourceJobId: 'art-source-job',
    });

    const a = await cards.commitArtRevision({
      cardId: card.id,
      expectedRevisionId: parent.id,
      artworkRevisionId: artRev.id,
      sourceJobId: 'card-art-job-1',
    });
    const b = await cards.commitArtRevision({
      cardId: card.id,
      expectedRevisionId: parent.id,
      artworkRevisionId: artRev.id,
      sourceJobId: 'card-art-job-1',
    });
    expect(a.id).toBe(b.id);
    expect(a.document.name).toBe('Sparkfox');
    expect(a.document.flavorText).toBe('Brave');
    expect(a.document.presentation.rarity).toBe('legendary');
  });
});
