interface Env {
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const url = new URL(request.url);
        const key = url.searchParams.get('key');
        
        if (!key) {
            return new Response("Key parameter is required", { status: 400 });
        }

        // Validate key format to prevent path traversal
        if (!key.startsWith('generated/') || key.includes('..')) {
            return new Response("Invalid key format", { status: 400 });
        }

        const object = await env.IMAGES_BUCKET.get(key);
        
        if (!object) {
            return new Response("Image not found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        return new Response(object.body, { headers });
    } catch (error) {
        console.error("Image View Error:", error);
        return new Response("Internal server error", { status: 500 });
    }
};