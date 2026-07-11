import { MediaRepository } from '../server/media/repository';
import { MAX_UPLOAD_BYTES, NORMALIZATION_VERSION, normalizeImage } from '../server/media/normalize';
import type { Env } from './env';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export async function handleUpload(request: Request, env: Env, ownerId: string): Promise<Response> {
  if (env.APP_RATE_LIMITER) {
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      ownerId;
    const { success } = await env.APP_RATE_LIMITER.limit({ key: `upload:${ip}` });
    if (!success) {
      return json({ error: 'Too many uploads. Please slow down.' }, 429);
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('file') as {
    size?: number;
    type?: string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  } | null;
  // Accept Blob/File or File-like (tests); require size + arrayBuffer
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number') {
    return json({ error: 'file field is required' }, 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: `File too large. Maximum ${MAX_UPLOAD_BYTES} bytes.` }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) {
    return json({ error: 'Empty file' }, 400);
  }

  const sniffed = sniffMime(bytes);
  const mime = sniffed || file.type || 'application/octet-stream';
  if (!ALLOWED.has(mime) || !sniffed) {
    return json({ error: 'Only PNG, JPEG, or WebP uploads are allowed' }, 400);
  }

  const media = new MediaRepository(env);
  const uploadId = crypto.randomUUID();
  const day = new Date().toISOString().slice(0, 10);

  const original = await media.putAsset({
    ownerId,
    role: 'upload_original',
    bytes,
    mimeType: mime,
    r2Key: `uploads/${day}/${uploadId}/original`,
    normalizationVersion: NORMALIZATION_VERSION,
  });

  try {
    const variants = await normalizeImage(env.IMAGES, bytes, 'generic');
    const normalized = await media.putAsset({
      ownerId,
      role: 'input_normalized',
      bytes: variants.master.bytes.length ? variants.master.bytes : bytes,
      mimeType: variants.master.mimeType || 'image/png',
      width: variants.master.width || variants.sourceWidth,
      height: variants.master.height || variants.sourceHeight,
      parentAssetId: original.id,
      r2Key: `uploads/${day}/${uploadId}/normalized.png`,
      normalizationVersion: NORMALIZATION_VERSION,
    });

    return json({
      assetId: normalized.id,
      originalAssetId: original.id,
      width: normalized.width,
      height: normalized.height,
      mimeType: normalized.mimeType,
      url: media.assetUrl(normalized.id),
    });
  } catch (error) {
    // Best-effort cleanup of orphan original
    try {
      await env.IMAGES_BUCKET.delete(original.r2Key);
      await env.DB.prepare(`DELETE FROM media_assets WHERE id = ?`).bind(original.id).run();
    } catch {
      /* ignore */
    }
    const message = error instanceof Error ? error.message : 'Normalization failed';
    return json({ error: message }, 400);
  }
}

export async function handleGetAsset(
  request: Request,
  env: Env,
  assetId: string,
  ownerId: string | null
): Promise<Response> {
  const media = new MediaRepository(env);
  const asset = await media.get(assetId);
  if (!asset) {
    return json({ error: 'Not found' }, 404);
  }

  // Fail closed: require auth unless visibility is exactly 'public'
  if (asset.visibility !== 'public') {
    if (!ownerId || asset.ownerId !== ownerId) {
      return json({ error: 'Forbidden' }, 403);
    }
  }

  const obj = await env.IMAGES_BUCKET.get(asset.r2Key);
  if (!obj) {
    return json({ error: 'Not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', asset.mimeType);
  headers.set('ETag', `"${asset.sha256}"`);
  headers.set(
    'Cache-Control',
    asset.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=3600'
  );
  headers.set('Content-Length', String(asset.byteLength));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Accept-Ranges', 'bytes');

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.replace(/"/g, '') === asset.sha256) {
    return new Response(null, { status: 304, headers });
  }

  const range = request.headers.get('Range');
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      headers.set('Content-Range', `bytes */${asset.byteLength}`);
      return new Response(null, { status: 416, headers });
    }
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : asset.byteLength - 1;
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      end < start ||
      start >= asset.byteLength
    ) {
      headers.set('Content-Range', `bytes */${asset.byteLength}`);
      return new Response(null, { status: 416, headers });
    }
    const clampedEnd = Math.min(end, asset.byteLength - 1);
    const slice = await env.IMAGES_BUCKET.get(asset.r2Key, {
      range: { offset: start, length: clampedEnd - start + 1 },
    });
    if (slice) {
      headers.set('Content-Range', `bytes ${start}-${clampedEnd}/${asset.byteLength}`);
      headers.set('Content-Length', String(clampedEnd - start + 1));
      return new Response(slice.body, { status: 206, headers });
    }
  }

  return new Response(obj.body, { status: 200, headers });
}
