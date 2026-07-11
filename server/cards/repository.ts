import type { Env } from '../../worker/env';
import type { CardDocument, CardDocumentV1, CardRevision } from '../../shared/cards';
import { defaultCardDocument } from '../../shared/cards';

function mapCard(row: Record<string, unknown>): CardDocument {
  return {
    id: row.id as string,
    worldId: row.world_id as string,
    title: row.title as string,
    currentRevisionId: (row.current_revision_id as string) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapRevision(row: Record<string, unknown>): CardRevision {
  return {
    id: row.id as string,
    cardId: row.card_id as string,
    parentRevisionId: (row.parent_revision_id as string) ?? null,
    artworkRevisionId: (row.artwork_revision_id as string) ?? null,
    sourceJobId: (row.source_job_id as string) ?? null,
    schemaVersion: row.schema_version as number,
    document: JSON.parse(row.document_json as string) as CardDocumentV1,
    createdAt: row.created_at as number,
  };
}

export class CardsRepository {
  constructor(private env: Env) {}

  async listByWorld(worldId: string): Promise<CardDocument[]> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM card_documents WHERE world_id = ? ORDER BY updated_at DESC`
    )
      .bind(worldId)
      .all();
    return (res.results || []).map((r) => mapCard(r as Record<string, unknown>));
  }

  async get(id: string): Promise<CardDocument | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM card_documents WHERE id = ?`).bind(id).first();
    return row ? mapCard(row as Record<string, unknown>) : null;
  }

  async getRevision(id: string): Promise<CardRevision | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM card_revisions WHERE id = ?`).bind(id).first();
    return row ? mapRevision(row as Record<string, unknown>) : null;
  }

  async getRevisionByJob(jobId: string): Promise<CardRevision | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM card_revisions WHERE source_job_id = ?`)
      .bind(jobId)
      .first();
    return row ? mapRevision(row as Record<string, unknown>) : null;
  }

  async getCurrentRevision(cardId: string): Promise<CardRevision | null> {
    const card = await this.get(cardId);
    if (!card?.currentRevisionId) return null;
    return this.getRevision(card.currentRevisionId);
  }

  async create(
    worldId: string,
    params: { title?: string; document?: CardDocumentV1; artworkRevisionId?: string | null }
  ): Promise<{ card: CardDocument; revision: CardRevision }> {
    const id = crypto.randomUUID();
    const revId = crypto.randomUUID();
    const now = Date.now();
    const title = params.title?.trim() || params.document?.name || 'New Card';
    const doc = params.document ?? defaultCardDocument(title);

    await this.env.DB.batch([
      this.env.DB.prepare(
        `INSERT INTO card_documents (id, world_id, title, current_revision_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, worldId, title, revId, now, now),
      this.env.DB.prepare(
        `INSERT INTO card_revisions
         (id, card_id, parent_revision_id, artwork_revision_id, source_job_id, schema_version, document_json, created_at)
         VALUES (?, ?, NULL, ?, NULL, 1, ?, ?)`
      ).bind(revId, id, params.artworkRevisionId ?? null, JSON.stringify(doc), now),
    ]);

    return {
      card: {
        id,
        worldId,
        title,
        currentRevisionId: revId,
        createdAt: now,
        updatedAt: now,
      },
      revision: {
        id: revId,
        cardId: id,
        parentRevisionId: null,
        artworkRevisionId: params.artworkRevisionId ?? null,
        sourceJobId: null,
        schemaVersion: 1,
        document: doc,
        createdAt: now,
      },
    };
  }

  /**
   * PATCH document fields. Returns 409 semantics via null expected mismatch.
   */
  async patchDocument(params: {
    cardId: string;
    expectedRevisionId: string;
    document: CardDocumentV1;
    artworkRevisionId?: string | null;
  }): Promise<{ card: CardDocument; revision: CardRevision } | { conflict: true; currentRevisionId: string | null }> {
    const card = await this.get(params.cardId);
    if (!card) throw new Error('Card not found');
    if (card.currentRevisionId !== params.expectedRevisionId) {
      return { conflict: true, currentRevisionId: card.currentRevisionId };
    }

    const revId = crypto.randomUUID();
    const now = Date.now();
    const artworkRev =
      params.artworkRevisionId !== undefined
        ? params.artworkRevisionId
        : (await this.getRevision(params.expectedRevisionId))?.artworkRevisionId ?? null;

    await this.env.DB.batch([
      this.env.DB.prepare(
        `INSERT INTO card_revisions
         (id, card_id, parent_revision_id, artwork_revision_id, source_job_id, schema_version, document_json, created_at)
         VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`
      ).bind(revId, params.cardId, params.expectedRevisionId, artworkRev, JSON.stringify(params.document), now),
      this.env.DB.prepare(
        `UPDATE card_documents SET current_revision_id = ?, title = ?, updated_at = ?
         WHERE id = ? AND current_revision_id = ?`
      ).bind(revId, params.document.name, now, params.cardId, params.expectedRevisionId),
    ]);

    const updated = await this.get(params.cardId);
    if (!updated || updated.currentRevisionId !== revId) {
      return { conflict: true, currentRevisionId: updated?.currentRevisionId ?? null };
    }

    return {
      card: updated,
      revision: {
        id: revId,
        cardId: params.cardId,
        parentRevisionId: params.expectedRevisionId,
        artworkRevisionId: artworkRev,
        sourceJobId: null,
        schemaVersion: 1,
        document: params.document,
        createdAt: now,
      },
    };
  }

  /** After art job: one card revision keyed by source job, copying document fields. */
  async commitArtRevision(params: {
    cardId: string;
    expectedRevisionId: string | null;
    artworkRevisionId: string;
    sourceJobId: string;
  }): Promise<CardRevision> {
    const existing = await this.getRevisionByJob(params.sourceJobId);
    if (existing) return existing;

    const card = await this.get(params.cardId);
    if (!card) throw new Error('Card not found');

    const parentId = params.expectedRevisionId ?? card.currentRevisionId;
    const parent = parentId ? await this.getRevision(parentId) : null;
    const document = parent?.document ?? defaultCardDocument(card.title);

    const revId = crypto.randomUUID();
    const now = Date.now();

    try {
      await this.env.DB.prepare(
        `INSERT INTO card_revisions
         (id, card_id, parent_revision_id, artwork_revision_id, source_job_id, schema_version, document_json, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
        .bind(revId, params.cardId, parentId, params.artworkRevisionId, params.sourceJobId, JSON.stringify(document), now)
        .run();
    } catch {
      const raced = await this.getRevisionByJob(params.sourceJobId);
      if (raced) return raced;
      throw new Error('Failed to commit card art revision');
    }

    if (parentId) {
      await this.env.DB.prepare(
        `UPDATE card_documents SET current_revision_id = ?, updated_at = ?
         WHERE id = ? AND current_revision_id = ?`
      )
        .bind(revId, now, params.cardId, parentId)
        .run();
    } else {
      await this.env.DB.prepare(
        `UPDATE card_documents SET current_revision_id = ?, updated_at = ? WHERE id = ?`
      )
        .bind(revId, now, params.cardId)
        .run();
    }

    return {
      id: revId,
      cardId: params.cardId,
      parentRevisionId: parentId,
      artworkRevisionId: params.artworkRevisionId,
      sourceJobId: params.sourceJobId,
      schemaVersion: 1,
      document,
      createdAt: now,
    };
  }
}
