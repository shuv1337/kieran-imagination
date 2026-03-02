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

interface Env {
    GEMINI_API_KEY: string;
    GEMINI_IMAGE_MODEL?: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
    ASSETS: Fetcher;
    IMAGES?: ImagesBinding;
}

type PagesFunction<T = unknown> = (context: EventContext<T, any, any>) => Promise<Response> | Response;

interface EventContext<Env, P, Data> {
    request: Request;
    functionPath: string;
    waitUntil: (promise: Promise<any>) => void;
    passThroughOnException: () => void;
    next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
    env: Env;
    params: P;
    data: Data;
}
