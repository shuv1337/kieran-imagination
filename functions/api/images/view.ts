import { getClientIp, logRequest } from "../../utils";

interface Env {
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    try {
        if (!key) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/images/view',
                method: 'GET',
                statusCode: 400,
                durationMs: Date.now() - startTime,
                errorMessage: 'Key parameter is required'
            }));
            return new Response("Key parameter is required", { status: 400 });
        }

        // Validate key format to prevent path traversal
        if (!key.startsWith('generated/') || key.includes('..')) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/images/view',
                method: 'GET',
                statusCode: 400,
                durationMs: Date.now() - startTime,
                errorMessage: 'Invalid key format'
            }));
            return new Response("Invalid key format", { status: 400 });
        }

        const object = await env.IMAGES_BUCKET.get(key);

        if (!object) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/images/view',
                method: 'GET',
                statusCode: 404,
                durationMs: Date.now() - startTime,
                errorMessage: 'Image not found'
            }));
            return new Response("Image not found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        waitUntil(logRequest(env, request, {
            endpoint: '/api/images/view',
            method: 'GET',
            statusCode: 200,
            durationMs: Date.now() - startTime
        }));

        return new Response(object.body, { headers });
    } catch (error) {
        console.error("Image View Error:", error);
        waitUntil(logRequest(env, request, {
            endpoint: '/api/images/view',
            method: 'GET',
            statusCode: 500,
            durationMs: Date.now() - startTime,
            errorMessage: error instanceof Error ? error.message : String(error)
        }));
        return new Response("Internal server error", { status: 500 });
    }
};