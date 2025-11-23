export interface Env {
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export interface PersistedImage {
    key: string;
    publicUrl: string;
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
export const MAX_BASE64_BYTES = 2 * 1024 * 1024; // 2MB

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

        return { key, publicUrl: buildPublicUrl(key) };
    } catch (error) {
        try {
            await env.IMAGES_BUCKET.delete(key);
        } catch (deleteError) {
            logError('cleanup', deleteError as Error, { key });
        }
        throw error;
    }
}
