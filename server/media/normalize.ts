import { normalizationFailed } from '../creation/errors';

/** Minimal Images binding surface used for normalization. */
export interface ImagesBinding {
  input(data: ArrayBuffer | ReadableStream<Uint8Array>): {
    transform(options: {
      width?: number;
      height?: number;
      fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
      quality?: number;
      background?: string;
    }): {
      output(options: {
        format?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';
      }): Promise<{ response(): Promise<Response> }>;
    };
  };
  info(data: ArrayBuffer | ReadableStream<Uint8Array>): Promise<{
    width: number;
    height: number;
    format: string;
  }>;
}

export const NORMALIZATION_VERSION = 'v1';

export const COLORING_MASTER = { width: 1536, height: 2048 };
export const COLORING_PREVIEW = { width: 768, height: 1024 };
export const PRINT_CANVAS = { width: 2550, height: 3300 };
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type MediaGeometry = 'coloring' | 'card-art' | 'generic';

export interface NormalizedVariants {
  master: { bytes: Uint8Array; width: number; height: number; mimeType: string };
  preview: { bytes: Uint8Array; width: number; height: number; mimeType: string };
  print: { bytes: Uint8Array; width: number; height: number; mimeType: string } | null;
  sourceWidth: number;
  sourceHeight: number;
  sourceFormat: string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function transformTo(
  images: ImagesBinding,
  input: ArrayBuffer,
  width: number,
  height: number,
  format: 'image/png' | 'image/webp',
  fit: 'pad' | 'contain' | 'cover' | 'scale-down' = 'pad'
): Promise<{ bytes: Uint8Array; width: number; height: number; mimeType: string }> {
  const response = await (
    await images
      .input(input)
      .transform({
        width,
        height,
        fit,
        background: fit === 'pad' ? '#FFFFFF' : undefined,
      })
      .output({ format })
  ).response();

  const buf = new Uint8Array(await response.arrayBuffer());
  return { bytes: buf, width, height, mimeType: format };
}

/**
 * Normalize provider/upload bytes into master + preview (+ optional print).
 * Uses Cloudflare Images: orientation is fixed by the pipeline; white pad, never crop for coloring.
 */
export async function normalizeImage(
  images: ImagesBinding | undefined,
  rawBytes: Uint8Array,
  geometry: MediaGeometry
): Promise<NormalizedVariants> {
  if (!rawBytes.length) {
    throw normalizationFailed('Empty image bytes');
  }

  const ab = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer;

  if (!images) {
    // Local/test fallback: store raw as master/preview without transforms
    return {
      master: { bytes: rawBytes, width: 0, height: 0, mimeType: 'image/png' },
      preview: { bytes: rawBytes, width: 0, height: 0, mimeType: 'image/webp' },
      print: null,
      sourceWidth: 0,
      sourceHeight: 0,
      sourceFormat: 'image/png',
    };
  }

  let info: { width: number; height: number; format: string };
  try {
    info = await images.info(ab);
  } catch {
    throw normalizationFailed('Could not read image metadata');
  }

  if (!info.width || !info.height) {
    throw normalizationFailed('Invalid image dimensions');
  }

  const masterTarget =
    geometry === 'card-art'
      ? { width: 1024, height: 1536 }
      : COLORING_MASTER;

  const previewTarget =
    geometry === 'card-art'
      ? { width: 512, height: 768 }
      : COLORING_PREVIEW;

  const master = await transformTo(
    images,
    ab,
    masterTarget.width,
    masterTarget.height,
    'image/png',
    'pad'
  );

  const preview = await transformTo(
    images,
    ab,
    previewTarget.width,
    previewTarget.height,
    'image/webp',
    'pad'
  );

  let print: NormalizedVariants['print'] = null;
  if (geometry === 'coloring' && info.width >= 1200 && info.height >= 1600) {
    print = await transformTo(
      images,
      ab,
      PRINT_CANVAS.width,
      PRINT_CANVAS.height,
      'image/png',
      'pad'
    );
  }

  return {
    master,
    preview,
    print,
    sourceWidth: info.width,
    sourceHeight: info.height,
    sourceFormat: info.format,
  };
}

export function geometryForOperation(operation: string): MediaGeometry {
  if (operation.startsWith('card-art')) return 'card-art';
  if (operation.startsWith('coloring')) return 'coloring';
  return 'generic';
}

export interface SemanticCheckResult {
  ok: boolean;
  reason?: string;
  /** True when a second provider attempt with a repair prompt may help. */
  repairable: boolean;
}

/**
 * Best-effort semantic checks on provider output for coloring pages.
 *
 * Primary signals (reliable): empty bytes, missing/wrong aspect when width/height known.
 * Monochrome: deliberately soft — compressed PNG/WebP bytes are NOT decoded pixels, so
 * chroma sampling of compressed streams is noisy. We only flag extreme entropy patterns
 * that look like photographic color noise, and only when dimensions are known.
 * Prefer Cloudflare Images downscale+sample in a future pass for true pixel chroma.
 */
export function semanticCheckColoringImage(
  bytes: Uint8Array,
  width: number,
  height: number
): SemanticCheckResult {
  if (!bytes.length || bytes.length < 100) {
    return { ok: false, reason: 'empty_or_tiny', repairable: true };
  }
  if (!width || !height) {
    // Without dimensions, only reject empty (local mock / no Images binding)
    return { ok: true, repairable: false };
  }

  const aspect = width / height;
  const target = 3 / 4; // 0.75 portrait
  // Weight aspect: reject landscape and near-square far from 3:4
  if (aspect < 0.5 || aspect > 1.0) {
    return { ok: false, reason: 'wrong_aspect', repairable: true };
  }
  if (Math.abs(aspect - target) > 0.28) {
    return { ok: false, reason: 'wrong_aspect', repairable: true };
  }

  // Soft monochrome heuristic on compressed payload (best-effort only).
  // High threshold to avoid false positives on clean line-art PNGs.
  let highVariance = 0;
  let samples = 0;
  const stride = Math.max(3, Math.floor(bytes.length / 128));
  for (let i = 0; i + 2 < bytes.length && samples < 128; i += stride) {
    const r = bytes[i];
    const g = bytes[i + 1];
    const b = bytes[i + 2];
    samples += 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Only extreme chroma channels in compressed stream
    if (max - min > 120 && max > 80 && min < 180) {
      highVariance += 1;
    }
  }
  if (samples > 40 && highVariance / samples > 0.55) {
    return { ok: false, reason: 'not_monochrome', repairable: true };
  }

  return { ok: true, repairable: false };
}

export const REPAIR_COLORING_INSTRUCTION =
  'CRITICAL REPAIR: Convert this into a pure black-and-white line art coloring page. ONLY pure black outlines on pure white background. Remove ALL colors, shading, grayscale fills, and gradients. Every shape must be an empty outline.';
