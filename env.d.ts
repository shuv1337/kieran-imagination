/// <reference types="vite/client" />

declare global {
    interface R2Bucket {
        get(key: string): Promise<R2Object | null>;
        put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: R2PutOptions): Promise<void>;
        delete(key: string): Promise<void>;
        head(key: string): Promise<R2Object | null>;
        list(options?: R2ListOptions): Promise<R2Objects>;
    }

    interface R2Object {
        key: string;
        size: number;
        etag: string;
        lastModified: Date;
        httpMetadata: R2HTTPMetadata;
        customMetadata: Record<string, string>;
        body: ReadableStream;
        writeHttpMetadata(headers: Headers): void;
    }

    interface R2HTTPMetadata {
        contentType?: string;
        contentLanguage?: string;
        contentDisposition?: string;
        contentEncoding?: string;
        cacheControl?: string;
        cacheExpiry?: Date;
    }

    interface R2PutOptions {
        httpMetadata?: R2HTTPMetadata;
        customMetadata?: Record<string, string>;
    }

    interface R2ListOptions {
        limit?: number;
        prefix?: string;
        cursor?: string;
    }

    interface R2Objects {
        objects: R2Object[];
        truncated: boolean;
        cursor?: string;
    }

    interface D1Database {
        prepare(query: string): D1PreparedStatement;
    }

    interface D1PreparedStatement {
        bind(...values: any[]): D1PreparedStatement;
        run(): Promise<D1Result>;
        first<T = any>(): Promise<T | null>;
        all<T = any>(): Promise<D1Result<T>>;
    }

    interface D1Result<T = any> {
        results: T[];
        success: boolean;
        meta: {
            duration: number;
            changes: number;
            last_row_id: number;
            served_by: string;
        };
    }

    interface PagesFunction<Env = any> {
        (context: {
            request: Request;
            env: Env;
            params: Record<string, string>;
            waitUntil: (promise: Promise<any>) => void;
            next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
            data: Record<string, any>;
        }): Response | Promise<Response>;
    }
}

export {};