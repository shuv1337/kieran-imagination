interface Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
    ASSETS: Fetcher;
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
