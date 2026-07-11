import type { Env } from '../../worker/env';
import { sha256Hex, NORMALIZATION_VERSION, type NormalizedVariants } from './normalize';

export type MediaRole =
  | 'upload_original'
  | 'input_normalized'
  | 'provider_raw'
  | 'master'
  | 'preview'
  | 'print';

export interface MediaAssetRow {
  id: string;
  ownerId: string;
  role: MediaRole;
  visibility: 'private' | 'public';
  mimeType: string;
  width: number | null;
  height: number | null;
  byteLength: number;
  sha256: string;
  r2Key: string;
  sourceJobId: string | null;
  sourceModel: string | null;
  normalizationVersion: string | null;
  parentAssetId: string | null;
  createdAt: number;
}

function mapRow(row: Record<string, unknown>): MediaAssetRow {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    role: row.role as MediaRole,
    visibility: row.visibility as 'private' | 'public',
    mimeType: row.mime_type as string,
    width: (row.width as number) ?? null,
    height: (row.height as number) ?? null,
    byteLength: row.byte_length as number,
    sha256: row.sha256 as string,
    r2Key: row.r2_key as string,
    sourceJobId: (row.source_job_id as string) ?? null,
    sourceModel: (row.source_model as string) ?? null,
    normalizationVersion: (row.normalization_version as string) ?? null,
    parentAssetId: (row.parent_asset_id as string) ?? null,
    createdAt: row.created_at as number,
  };
}

export function jobAttemptKey(jobId: string, attempt: number, suffix: string): string {
  return `jobs/${jobId}/a${attempt}/${suffix}`;
}

export class MediaRepository {
  constructor(private env: Env) {}

  async get(id: string): Promise<MediaAssetRow | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(id).first();
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async getByR2Key(r2Key: string): Promise<MediaAssetRow | null> {
    const row = await this.env.DB.prepare(`SELECT * FROM media_assets WHERE r2_key = ?`)
      .bind(r2Key)
      .first();
    return row ? mapRow(row as Record<string, unknown>) : null;
  }

  async getBytes(asset: MediaAssetRow): Promise<Uint8Array> {
    const obj = await this.env.IMAGES_BUCKET.get(asset.r2Key);
    if (!obj) throw new Error(`Missing R2 object ${asset.r2Key}`);
    return new Uint8Array(await obj.arrayBuffer());
  }

  /**
   * Idempotent put: if r2_key already has a row, return it (step replay safe).
   * Always (re)writes R2 so partial failures recover.
   */
  async putAsset(params: {
    ownerId: string;
    role: MediaRole;
    bytes: Uint8Array;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    sourceJobId?: string | null;
    sourceModel?: string | null;
    parentAssetId?: string | null;
    visibility?: 'private' | 'public';
    r2Key: string;
    normalizationVersion?: string | null;
  }): Promise<MediaAssetRow> {
    const existing = await this.getByR2Key(params.r2Key);
    if (existing) {
      // Ensure object exists in R2
      const obj = await this.env.IMAGES_BUCKET.head(params.r2Key);
      if (!obj) {
        await this.env.IMAGES_BUCKET.put(params.r2Key, params.bytes, {
          httpMetadata: { contentType: params.mimeType },
        });
      }
      return existing;
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const sha256 = await sha256Hex(params.bytes);

    await this.env.IMAGES_BUCKET.put(params.r2Key, params.bytes, {
      httpMetadata: { contentType: params.mimeType },
      customMetadata: {
        assetId: id,
        role: params.role,
        sha256,
      },
    });

    try {
      await this.env.DB.prepare(
        `INSERT INTO media_assets
         (id, owner_id, role, visibility, mime_type, width, height, byte_length, sha256, r2_key,
          source_job_id, source_model, normalization_version, parent_asset_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          params.ownerId,
          params.role,
          params.visibility ?? 'private',
          params.mimeType,
          params.width ?? null,
          params.height ?? null,
          params.bytes.byteLength,
          sha256,
          params.r2Key,
          params.sourceJobId ?? null,
          params.sourceModel ?? null,
          params.normalizationVersion ?? null,
          params.parentAssetId ?? null,
          createdAt
        )
        .run();
    } catch (error) {
      // Unique race: another concurrent insert won
      const raced = await this.getByR2Key(params.r2Key);
      if (raced) return raced;
      throw error;
    }

    return {
      id,
      ownerId: params.ownerId,
      role: params.role,
      visibility: params.visibility ?? 'private',
      mimeType: params.mimeType,
      width: params.width ?? null,
      height: params.height ?? null,
      byteLength: params.bytes.byteLength,
      sha256,
      r2Key: params.r2Key,
      sourceJobId: params.sourceJobId ?? null,
      sourceModel: params.sourceModel ?? null,
      normalizationVersion: params.normalizationVersion ?? null,
      parentAssetId: params.parentAssetId ?? null,
      createdAt,
    };
  }

  /** Persist provider raw immediately after Google response (before normalize). */
  async persistProviderRaw(params: {
    ownerId: string;
    jobId: string;
    attempt: number;
    sourceModel: string | null;
    rawBytes: Uint8Array;
    rawMime: string;
    width?: number | null;
    height?: number | null;
  }): Promise<MediaAssetRow> {
    return this.putAsset({
      ownerId: params.ownerId,
      role: 'provider_raw',
      bytes: params.rawBytes,
      mimeType: params.rawMime,
      width: params.width ?? null,
      height: params.height ?? null,
      sourceJobId: params.jobId,
      sourceModel: params.sourceModel,
      r2Key: jobAttemptKey(params.jobId, params.attempt, 'raw'),
      normalizationVersion: NORMALIZATION_VERSION,
    });
  }

  async persistNormalizedFamily(params: {
    ownerId: string;
    jobId: string;
    attempt: number;
    sourceModel: string | null;
    variants: NormalizedVariants;
    rawBytes?: Uint8Array;
    rawMime?: string;
    existingRaw?: MediaAssetRow | null;
  }): Promise<{ master: MediaAssetRow; preview: MediaAssetRow; print: MediaAssetRow | null; raw: MediaAssetRow }> {
    const base = `jobs/${params.jobId}/a${params.attempt}`;

    let raw = params.existingRaw ?? (await this.findProviderRaw(params.jobId, params.attempt));
    if (!raw) {
      if (!params.rawBytes) throw new Error('rawBytes required when no existing raw');
      raw = await this.putAsset({
        ownerId: params.ownerId,
        role: 'provider_raw',
        bytes: params.rawBytes,
        mimeType: params.rawMime || 'image/png',
        width: params.variants.sourceWidth,
        height: params.variants.sourceHeight,
        sourceJobId: params.jobId,
        sourceModel: params.sourceModel,
        r2Key: `${base}/raw`,
        normalizationVersion: NORMALIZATION_VERSION,
      });
    }

    const master = await this.putAsset({
      ownerId: params.ownerId,
      role: 'master',
      bytes: params.variants.master.bytes,
      mimeType: params.variants.master.mimeType,
      width: params.variants.master.width,
      height: params.variants.master.height,
      sourceJobId: params.jobId,
      sourceModel: params.sourceModel,
      parentAssetId: raw.id,
      r2Key: `${base}/master.png`,
      normalizationVersion: NORMALIZATION_VERSION,
    });

    const preview = await this.putAsset({
      ownerId: params.ownerId,
      role: 'preview',
      bytes: params.variants.preview.bytes,
      mimeType: params.variants.preview.mimeType,
      width: params.variants.preview.width,
      height: params.variants.preview.height,
      sourceJobId: params.jobId,
      sourceModel: params.sourceModel,
      parentAssetId: master.id,
      r2Key: `${base}/preview.webp`,
      normalizationVersion: NORMALIZATION_VERSION,
    });

    let print: MediaAssetRow | null = null;
    if (params.variants.print) {
      print = await this.putAsset({
        ownerId: params.ownerId,
        role: 'print',
        bytes: params.variants.print.bytes,
        mimeType: params.variants.print.mimeType,
        width: params.variants.print.width,
        height: params.variants.print.height,
        sourceJobId: params.jobId,
        sourceModel: params.sourceModel,
        parentAssetId: master.id,
        r2Key: `${base}/print.png`,
        normalizationVersion: NORMALIZATION_VERSION,
      });
    }

    return { master, preview, print, raw };
  }

  /** Find existing master for job/attempt (step replay). */
  async findMaster(jobId: string, attempt: number): Promise<MediaAssetRow | null> {
    return this.getByR2Key(jobAttemptKey(jobId, attempt, 'master.png'));
  }

  async findProviderRaw(jobId: string, attempt: number): Promise<MediaAssetRow | null> {
    return this.getByR2Key(jobAttemptKey(jobId, attempt, 'raw'));
  }

  assetUrl(assetId: string): string {
    return `/api/assets/${assetId}`;
  }
}
