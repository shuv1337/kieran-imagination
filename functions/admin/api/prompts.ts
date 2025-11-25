import { jsonResponse } from "../../utils";
import { requireAuth } from "../auth";

interface Env {
    DB: D1Database;
}

interface PromptEntry {
    id: string;
    timestamp: number;
    ip_address: string;
    prompt: string;
    status_code: number;
    generated_image_id: string | null;
    r2_key: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const search = url.searchParams.get('search') || '';

    try {
        let query = `
            SELECT
                rl.id,
                rl.timestamp,
                rl.ip_address,
                rl.prompt,
                rl.status_code,
                rl.generated_image_id,
                gi.r2_key
            FROM request_logs rl
            LEFT JOIN generated_images gi ON rl.generated_image_id = gi.id
            WHERE rl.prompt IS NOT NULL AND rl.prompt != ''
        `;

        const params: (string | number)[] = [];
        if (search) {
            query += ' AND rl.prompt LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY rl.timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const results = await env.DB.prepare(query).bind(...params).all<PromptEntry>();

        return jsonResponse({ prompts: results.results ?? [] });
    } catch (error) {
        console.error('Prompts error:', error);
        return jsonResponse({ error: 'Failed to fetch prompts' }, 500);
    }
};
