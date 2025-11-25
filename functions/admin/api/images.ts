import { jsonResponse, buildPublicUrl } from "../../utils";
import { requireAuth } from "../auth";

interface Env {
    DB: D1Database;
}

interface ImageEntry {
    id: string;
    file_name: string;
    prompt: string;
    r2_key: string;
    created_at: number;
    source: string;
    metadata: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const source = url.searchParams.get('source');

    try {
        let query = `
            SELECT
                id,
                file_name,
                prompt,
                r2_key,
                created_at,
                source,
                metadata
            FROM generated_images
        `;

        const params: (string | number)[] = [];
        if (source) {
            query += ' WHERE source = ?';
            params.push(source);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const results = await env.DB.prepare(query).bind(...params).all<ImageEntry>();

        const images = (results.results ?? []).map((img) => ({
            ...img,
            publicUrl: buildPublicUrl(img.r2_key)
        }));

        return jsonResponse({ images });
    } catch (error) {
        console.error('Images error:', error);
        return jsonResponse({ error: 'Failed to fetch images' }, 500);
    }
};
