import type { Env } from '../../worker/env';
import type {
  Artwork,
  ArtworkRevision,
  CreateArtworkRequest,
  CreateWorldRequest,
  ImaginationWorld,
  WorldCharacter,
} from '../../shared/worlds';

function mapWorld(row: Record<string, unknown>): ImaginationWorld {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    archived: Boolean(row.archived),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapArtwork(row: Record<string, unknown>): Artwork {
  return {
    id: row.id as string,
    worldId: row.world_id as string,
    kind: row.kind as Artwork['kind'],
    title: row.title as string,
    currentRevisionId: (row.current_revision_id as string) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapRevision(row: Record<string, unknown>): ArtworkRevision {
  return {
    id: row.id as string,
    artworkId: row.artwork_id as string,
    parentRevisionId: (row.parent_revision_id as string) ?? null,
    mediaAssetId: row.media_asset_id as string,
    sourceJobId: (row.source_job_id as string) ?? null,
    prompt: (row.prompt as string) ?? null,
    instruction: (row.instruction as string) ?? null,
    inputRevisionIds: JSON.parse((row.input_revision_ids_json as string) || '[]'),
    provenance: JSON.parse((row.provenance_json as string) || '{}'),
    createdAt: row.created_at as number,
  };
}

export class WorldsRepository {
  constructor(private env: Env) {}

  async listWorlds(ownerId: string): Promise<ImaginationWorld[]> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM imagination_worlds WHERE owner_id = ? AND archived = 0 ORDER BY updated_at DESC`
    )
      .bind(ownerId)
      .all();
    return (res.results || []).map((r) => mapWorld(r as Record<string, unknown>));
  }

  async getWorld(id: string, ownerId: string): Promise<ImaginationWorld | null> {
    const row = await this.env.DB.prepare(
      `SELECT * FROM imagination_worlds WHERE id = ? AND owner_id = ?`
    )
      .bind(id, ownerId)
      .first();
    return row ? mapWorld(row as Record<string, unknown>) : null;
  }

  async createWorld(ownerId: string, body: CreateWorldRequest): Promise<ImaginationWorld> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO imagination_worlds (id, owner_id, title, description, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
      .bind(id, ownerId, body.title.trim() || 'My World', body.description ?? null, now, now)
      .run();
    return {
      id,
      ownerId,
      title: body.title.trim() || 'My World',
      description: body.description ?? null,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async patchWorld(
    id: string,
    ownerId: string,
    patch: { title?: string; description?: string; archived?: boolean }
  ): Promise<ImaginationWorld | null> {
    const existing = await this.getWorld(id, ownerId);
    if (!existing) return null;
    const title = patch.title?.trim() ?? existing.title;
    const description = patch.description !== undefined ? patch.description : existing.description;
    const archived = patch.archived ?? existing.archived;
    const now = Date.now();
    await this.env.DB.prepare(
      `UPDATE imagination_worlds SET title = ?, description = ?, archived = ?, updated_at = ? WHERE id = ?`
    )
      .bind(title, description, archived ? 1 : 0, now, id)
      .run();
    return { ...existing, title, description, archived, updatedAt: now };
  }

  async listArtworks(worldId: string): Promise<Artwork[]> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM artworks WHERE world_id = ? ORDER BY updated_at DESC`
    )
      .bind(worldId)
      .all();
    return (res.results || []).map((r) => mapArtwork(r as Record<string, unknown>));
  }

  async getArtwork(id: string): Promise<Artwork | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM artworks WHERE id = ?`).bind(id).first();
    return row ? mapArtwork(row as Record<string, unknown>) : null;
  }

  async createArtwork(worldId: string, body: CreateArtworkRequest): Promise<Artwork> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO artworks (id, world_id, kind, title, current_revision_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`
    )
      .bind(id, worldId, body.kind, body.title.trim() || 'Untitled', now, now)
      .run();
    await this.env.DB.prepare(`UPDATE imagination_worlds SET updated_at = ? WHERE id = ?`)
      .bind(now, worldId)
      .run();
    return {
      id,
      worldId,
      kind: body.kind,
      title: body.title.trim() || 'Untitled',
      currentRevisionId: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listRevisions(artworkId: string): Promise<ArtworkRevision[]> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM artwork_revisions WHERE artwork_id = ? ORDER BY created_at DESC`
    )
      .bind(artworkId)
      .all();
    return (res.results || []).map((r) => mapRevision(r as Record<string, unknown>));
  }

  async getRevision(id: string): Promise<ArtworkRevision | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM artwork_revisions WHERE id = ?`).bind(id).first();
    return row ? mapRevision(row as Record<string, unknown>) : null;
  }

  async getRevisionByJob(jobId: string): Promise<ArtworkRevision | null> {
    const row = await this.env.DB.prepare(
      `SELECT * FROM artwork_revisions WHERE source_job_id = ?`
    )
      .bind(jobId)
      .first();
    return row ? mapRevision(row as Record<string, unknown>) : null;
  }

  /**
   * Commit a revision. Unique on source_job_id; concurrent head updates use optimistic parent check.
   * Losers remain visible branches (revision still stored).
   */
  async commitRevision(params: {
    artworkId: string;
    parentRevisionId: string | null;
    mediaAssetId: string;
    sourceJobId: string | null;
    prompt?: string | null;
    instruction?: string | null;
    inputRevisionIds?: string[];
    provenance?: Record<string, unknown>;
  }): Promise<ArtworkRevision> {
    if (params.sourceJobId) {
      const existing = await this.getRevisionByJob(params.sourceJobId);
      if (existing) return existing;
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const inputJson = JSON.stringify(params.inputRevisionIds ?? []);
    const provenanceJson = JSON.stringify(params.provenance ?? {});

    try {
      await this.env.DB.prepare(
        `INSERT INTO artwork_revisions
         (id, artwork_id, parent_revision_id, media_asset_id, source_job_id, prompt, instruction,
          input_revision_ids_json, provenance_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          params.artworkId,
          params.parentRevisionId,
          params.mediaAssetId,
          params.sourceJobId,
          params.prompt ?? null,
          params.instruction ?? null,
          inputJson,
          provenanceJson,
          now
        )
        .run();
    } catch (error) {
      if (params.sourceJobId) {
        const raced = await this.getRevisionByJob(params.sourceJobId);
        if (raced) return raced;
      }
      throw error;
    }

    // Optimistic CAS head update. Concurrent losers remain visible branches (revision stored).
    if (params.parentRevisionId) {
      await this.env.DB.prepare(
        `UPDATE artworks SET current_revision_id = ?, updated_at = ?
         WHERE id = ? AND current_revision_id = ?`
      )
        .bind(id, now, params.artworkId, params.parentRevisionId)
        .run();
      // First head when current was null
      await this.env.DB.prepare(
        `UPDATE artworks SET current_revision_id = ?, updated_at = ?
         WHERE id = ? AND current_revision_id IS NULL`
      )
        .bind(id, now, params.artworkId)
        .run();
    } else {
      // Null parent: only win head if still empty (no unconditional clobber)
      await this.env.DB.prepare(
        `UPDATE artworks SET current_revision_id = ?, updated_at = ?
         WHERE id = ? AND current_revision_id IS NULL`
      )
        .bind(id, now, params.artworkId)
        .run();
    }

    const artwork = await this.getArtwork(params.artworkId);
    if (artwork) {
      await this.env.DB.prepare(`UPDATE imagination_worlds SET updated_at = ? WHERE id = ?`)
        .bind(now, artwork.worldId)
        .run();
    }

    return {
      id,
      artworkId: params.artworkId,
      parentRevisionId: params.parentRevisionId,
      mediaAssetId: params.mediaAssetId,
      sourceJobId: params.sourceJobId,
      prompt: params.prompt ?? null,
      instruction: params.instruction ?? null,
      inputRevisionIds: params.inputRevisionIds ?? [],
      provenance: params.provenance ?? {},
      createdAt: now,
    };
  }

  async listCharacters(worldId: string): Promise<WorldCharacter[]> {
    const res = await this.env.DB.prepare(
      `SELECT c.*, ar.media_asset_id as pinned_media_asset_id
       FROM world_characters c
       LEFT JOIN artwork_revisions ar ON ar.id = c.pinned_revision_id
       WHERE c.world_id = ?
       ORDER BY c.name ASC`
    )
      .bind(worldId)
      .all();
    return (res.results || []).map((r) => ({
      id: (r as any).id,
      worldId: (r as any).world_id,
      name: (r as any).name,
      pinnedRevisionId: (r as any).pinned_revision_id ?? null,
      pinnedMediaAssetId: (r as any).pinned_media_asset_id ?? null,
      notes: (r as any).notes ?? null,
      createdAt: (r as any).created_at,
      updatedAt: (r as any).updated_at,
    }));
  }

  async createCharacter(
    worldId: string,
    body: { name: string; pinnedRevisionId?: string; notes?: string }
  ): Promise<WorldCharacter> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO world_characters (id, world_id, name, pinned_revision_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, worldId, body.name.trim(), body.pinnedRevisionId ?? null, body.notes ?? null, now, now)
      .run();
    return {
      id,
      worldId,
      name: body.name.trim(),
      pinnedRevisionId: body.pinnedRevisionId ?? null,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async pinCharacter(
    characterId: string,
    worldId: string,
    pinnedRevisionId: string | null
  ): Promise<WorldCharacter | null> {
    const now = Date.now();
    await this.env.DB.prepare(
      `UPDATE world_characters SET pinned_revision_id = ?, updated_at = ?
       WHERE id = ? AND world_id = ?`
    )
      .bind(pinnedRevisionId, now, characterId, worldId)
      .run();
    const row = await this.env.DB.prepare(
      `SELECT * FROM world_characters WHERE id = ? AND world_id = ?`
    )
      .bind(characterId, worldId)
      .first();
    if (!row) return null;
    return {
      id: (row as any).id,
      worldId: (row as any).world_id,
      name: (row as any).name,
      pinnedRevisionId: (row as any).pinned_revision_id ?? null,
      notes: (row as any).notes ?? null,
      createdAt: (row as any).created_at,
      updatedAt: (row as any).updated_at,
    };
  }

  /** Resolve character role inputs from pinned revisions for a world. */
  async characterInputsForWorld(
    worldId: string
  ): Promise<Array<{ assetId: string; role: 'character'; position: number }>> {
    const characters = await this.listCharacters(worldId);
    const out: Array<{ assetId: string; role: 'character'; position: number }> = [];
    let pos = 10;
    for (const c of characters) {
      if (!c.pinnedRevisionId) continue;
      const rev = await this.getRevision(c.pinnedRevisionId);
      if (rev) {
        out.push({ assetId: rev.mediaAssetId, role: 'character', position: pos++ });
        break; // at most one character reference for simplicity
      }
    }
    return out;
  }
}
