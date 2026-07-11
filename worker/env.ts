export interface ImagesTransformOptions {
  width?: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  quality?: number;
  background?: string;
}

export interface ImagesOutputOptions {
  format?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';
}

export interface ImagesTransformable {
  transform(options: ImagesTransformOptions): ImagesTransformable;
  output(options: ImagesOutputOptions): Promise<{ response(): Promise<Response> }>;
}

export interface ImagesInfoResult {
  width: number;
  height: number;
  format: string;
}

export interface ImagesBinding {
  input(data: ArrayBuffer | ReadableStream<Uint8Array>): ImagesTransformable;
  info(data: ArrayBuffer | ReadableStream<Uint8Array>): Promise<ImagesInfoResult>;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  IMAGES_BUCKET: R2Bucket;
  DB: D1Database;
  IMAGES?: ImagesBinding;
  CREATION_WORKFLOW: Workflow;
  APP_RATE_LIMITER?: RateLimiter;

  GEMINI_API_KEY: string;
  FAMILY_ACCESS_CODE: string;
  SESSION_SIGNING_KEY: string;

  DAILY_CREDIT_LIMIT?: string;
  /** Fixed household owner id for the shared family door. */
  HOUSEHOLD_OWNER_ID?: string;
}

export const HOUSEHOLD_OWNER_DEFAULT = 'household';

export function dailyCreditLimit(env: Env): number {
  const n = parseInt(env.DAILY_CREDIT_LIMIT || '40', 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

export function householdOwnerId(env: Env): string {
  return env.HOUSEHOLD_OWNER_ID?.trim() || HOUSEHOLD_OWNER_DEFAULT;
}
