// Cloudflare Images binding types
interface ImagesTransformOptions {
    width?: number;
    height?: number;
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
    quality?: number;
}

interface ImagesOutputOptions {
    format?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';
}

interface ImagesTransformable {
    transform(options: ImagesTransformOptions): ImagesTransformable;
    output(options: ImagesOutputOptions): Promise<{ response(): Promise<Response> }>;
}

interface ImagesInfoResult {
    width: number;
    height: number;
    format: string;
}

interface ImagesBinding {
    input(data: ArrayBuffer | ReadableStream<Uint8Array>): ImagesTransformable;
    info(data: ArrayBuffer | ReadableStream<Uint8Array>): Promise<ImagesInfoResult>;
}

export interface Env {
    IMAGES_BUCKET?: R2Bucket;
    DB: D1Database;
    IMAGES?: ImagesBinding;
    GEMINI_IMAGE_MODEL?: string;
}

export interface PersistedImage {
    id: string;
    key: string;
    publicUrl: string;
}

export interface RequestLogEntry {
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs?: number;
    prompt?: string;
    errorMessage?: string;
    rateLimited?: boolean;
    generatedImageId?: string;
}

export interface LLMRequestLogEntry {
    requestType: 'generate' | 'edit' | 'upscale' | 'suggestions' | 'suggestions-seed' | 'improve-prompt' | 'card-generate';
    model: string;
    prompt?: string;
    hasInputImage?: boolean;
    durationMs?: number;
    success: boolean;
    errorMessage?: string;
    inputTokens?: number;
    outputTokens?: number;
    generatedImageId?: string;
}

export interface SaveImageOptions {
    originalFileName?: string;
    metadata?: Record<string, unknown>;
}

export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'HttpError';
    }
}

export const MAX_PROMPT_LENGTH = 1000;
export const MAX_BASE64_BYTES = 50 * 1024 * 1024; // 50MB - we accept larger images and resize them down
export const RESIZE_THRESHOLD_BYTES = 8 * 1024 * 1024; // 8MB - only resize if image exceeds this (avoids unnecessary resizing)
export const TARGET_IMAGE_MAX_DIMENSION = 1024; // Max dimension when resizing large images for Gemini
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';

export const getGeminiImageModel = (env: { GEMINI_IMAGE_MODEL?: string }): string => {
    const configured = env.GEMINI_IMAGE_MODEL?.trim();
    return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_IMAGE_MODEL;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });

export function logError(scope: string, error: unknown, context: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = { scope, ...context };
    if (error instanceof HttpError) {
        base.status = error.status;
        base.error = error.message;
    } else if (error instanceof Error) {
        base.error = error.message;
        base.stack = error.stack;
    } else {
        base.error = String(error);
    }
    console.error(JSON.stringify(base));
}

export async function logRequest(
    env: Env,
    request: Request,
    entry: RequestLogEntry
): Promise<void> {
    const id = crypto.randomUUID();
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    try {
        await env.DB.prepare(
            `INSERT INTO request_logs
             (id, timestamp, ip_address, endpoint, method, status_code, duration_ms, prompt, error_message, user_agent, rate_limited, generated_image_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
            .bind(
                id,
                Date.now(),
                ip,
                entry.endpoint,
                entry.method,
                entry.statusCode,
                entry.durationMs ?? null,
                entry.prompt ?? null,
                entry.errorMessage ?? null,
                userAgent,
                entry.rateLimited ? 1 : 0,
                entry.generatedImageId ?? null
            )
            .run();
    } catch (error) {
        logError('request-logging', error, { endpoint: entry.endpoint });
    }
}

export async function logLLMRequest(
    env: Env,
    request: Request,
    entry: LLMRequestLogEntry
): Promise<void> {
    const id = crypto.randomUUID();
    const ip = getClientIp(request);

    try {
        await env.DB.prepare(
            `INSERT INTO llm_requests
             (id, timestamp, ip_address, request_type, model, prompt, has_input_image, duration_ms, success, error_message, input_tokens, output_tokens, generated_image_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
            .bind(
                id,
                Date.now(),
                ip,
                entry.requestType,
                entry.model,
                entry.prompt ?? null,
                entry.hasInputImage ? 1 : 0,
                entry.durationMs ?? null,
                entry.success ? 1 : 0,
                entry.errorMessage ?? null,
                entry.inputTokens ?? null,
                entry.outputTokens ?? null,
                entry.generatedImageId ?? null
            )
            .run();
    } catch (error) {
        logError('llm-request-logging', error, { requestType: entry.requestType });
    }
}

export function calculateBase64Bytes(base64Data: string): number {
    const padding = (base64Data.match(/=+$/)?.[0].length ?? 0);
    return Math.ceil((base64Data.length * 3) / 4) - padding;
}

export function validatePayload(prompt: string, base64Data?: string): void {
    if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new HttpError(413, `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters.`);
    }

    if (base64Data) {
        const byteLength = calculateBase64Bytes(base64Data);
        if (byteLength > MAX_BASE64_BYTES) {
            throw new HttpError(413, `Image too large. Maximum ${MAX_BASE64_BYTES} bytes.`);
        }
    }
}

export function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0]?.trim() || 'unknown';
    }
    return request.headers.get('cf-connecting-ip') || 'unknown';
}

export function enforceRateLimit(identifier: string, scope: string, limit = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS) {
    const now = Date.now();
    const bucketKey = `${identifier}:${scope}`;
    const record = rateLimitBuckets.get(bucketKey);

    if (record && record.resetAt > now) {
        if (record.count >= limit) {
            throw new HttpError(429, 'Too many requests. Please slow down.');
        }
        record.count += 1;
        return;
    }

    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
}

export const getBase64FromUrl = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
};

export const buildPublicUrl = (key: string): string => `/api/images/view?key=${encodeURIComponent(key)}`;

async function hashPrompt(prompt: string): Promise<string> {
    const data = new TextEncoder().encode(prompt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function saveImageToR2AndDb(
    env: Env,
    base64Data: string,
    prompt: string,
    source: 'generate' | 'edit' | 'upscale' | 'upload',
    options: SaveImageOptions = {}
): Promise<PersistedImage> {
    const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const id = crypto.randomUUID();
    const fileName = `${id}.png`;
    const key = `generated/${new Date().toISOString().split('T')[0]}/${fileName}`;

    const promptHash = await hashPrompt(prompt);
    const metadata = {
        source,
        promptHash,
        originalFileName: options.originalFileName,
        ...options.metadata,
    };

    try {
        await env.IMAGES_BUCKET.put(key, imageBuffer, {
            httpMetadata: { contentType: 'image/png' },
        });

        await env.DB.prepare(
            `INSERT INTO generated_images (id, file_name, prompt, r2_key, created_at, source, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
            .bind(id, fileName, prompt, key, Date.now(), source, JSON.stringify(metadata))
            .run();

        return { id, key, publicUrl: buildPublicUrl(key) };
    } catch (error) {
        try {
            await env.IMAGES_BUCKET.delete(key);
        } catch (deleteError) {
            logError('cleanup', deleteError as Error, { key });
        }
        throw error;
    }
}

export interface ResizeResult {
    base64Data: string;
    originalWidth: number;
    originalHeight: number;
    newWidth: number;
    newHeight: number;
    wasResized: boolean;
}

/**
 * Resizes an image if it exceeds the size threshold using Cloudflare Images.
 * Only resizes large images that would otherwise cause issues - leaves smaller images alone.
 * Returns the resized base64 data, or the original if no resize was needed.
 */
export async function resizeImageIfNeeded(
    imagesBinding: ImagesBinding,
    base64Data: string,
    maxDimension: number = TARGET_IMAGE_MAX_DIMENSION,
    sizeThresholdBytes: number = RESIZE_THRESHOLD_BYTES
): Promise<ResizeResult> {
    // Check file size first - only resize if over threshold
    const estimatedBytes = calculateBase64Bytes(base64Data);
    if (estimatedBytes <= sizeThresholdBytes) {
        // Image is small enough, skip resize entirely
        return {
            base64Data,
            originalWidth: 0, // Unknown, didn't check
            originalHeight: 0,
            newWidth: 0,
            newHeight: 0,
            wasResized: false,
        };
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer as ArrayBuffer;

    // Get image info to check dimensions
    const info = await imagesBinding.info(arrayBuffer);
    const { width: originalWidth, height: originalHeight } = info;

    // Calculate new dimensions maintaining aspect ratio
    let newWidth: number;
    let newHeight: number;
    if (originalWidth > originalHeight) {
        newWidth = Math.min(maxDimension, originalWidth);
        newHeight = Math.round((originalHeight / originalWidth) * newWidth);
    } else {
        newHeight = Math.min(maxDimension, originalHeight);
        newWidth = Math.round((originalWidth / originalHeight) * newHeight);
    }

    // If dimensions wouldn't change much, skip resize
    if (newWidth >= originalWidth * 0.9 && newHeight >= originalHeight * 0.9) {
        return {
            base64Data,
            originalWidth,
            originalHeight,
            newWidth: originalWidth,
            newHeight: originalHeight,
            wasResized: false,
        };
    }

    // Resize the image using Cloudflare Images
    const resizedResponse = await (
        await imagesBinding
            .input(arrayBuffer)
            .transform({ width: newWidth, height: newHeight, fit: 'scale-down' })
            .output({ format: 'image/png' })
    ).response();

    // Convert response to base64
    const resizedBuffer = await resizedResponse.arrayBuffer();
    const resizedBytes = new Uint8Array(resizedBuffer);
    let resizedBase64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < resizedBytes.length; i += chunkSize) {
        resizedBase64 += String.fromCharCode(...resizedBytes.slice(i, i + chunkSize));
    }
    resizedBase64 = btoa(resizedBase64);

    return {
        base64Data: resizedBase64,
        originalWidth,
        originalHeight,
        newWidth,
        newHeight,
        wasResized: true,
    };
}
