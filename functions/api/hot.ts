import {
    HttpError,
    enforceRateLimit,
    getClientIp,
    jsonResponse,
    logError,
    buildPublicUrl,
} from "../utils";

interface Env {
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

interface ImageWithRating {
    id: string;
    url: string;
    prompt: string;
    created_at: number;
    hot_votes: number;
    not_votes: number;
    rating: number;
    total_votes: number;
    user_vote: string | null;
}

// GET /api/hot - Get images sorted by rating
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const ip = getClientIp(request);

        // Get images with vote counts
        const result = await env.DB.prepare(`
            SELECT 
                gi.id,
                gi.r2_key,
                gi.prompt,
                gi.created_at,
                COALESCE(SUM(CASE WHEN iv.vote_type = 'hot' THEN 1 ELSE 0 END), 0) as hot_votes,
                COALESCE(SUM(CASE WHEN iv.vote_type = 'not' THEN 1 ELSE 0 END), 0) as not_votes,
                COALESCE(SUM(CASE WHEN iv.vote_type = 'hot' THEN 1 ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN iv.vote_type = 'not' THEN 1 ELSE 0 END), 0) as rating,
                COUNT(iv.id) as total_votes,
                (SELECT vote_type FROM image_votes WHERE image_id = gi.id AND voter_ip = ?) as user_vote
            FROM generated_images gi
            LEFT JOIN image_votes iv ON gi.id = iv.image_id
            GROUP BY gi.id
            ORDER BY rating DESC, hot_votes DESC, gi.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(ip, limit, offset).all();

        const images: ImageWithRating[] = (result.results || []).map((row: any) => ({
            id: row.id,
            url: buildPublicUrl(row.r2_key),
            prompt: row.prompt,
            created_at: row.created_at,
            hot_votes: row.hot_votes,
            not_votes: row.not_votes,
            rating: row.rating,
            total_votes: row.total_votes,
            user_vote: row.user_vote,
        }));

        // Get total count
        const countResult = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM generated_images'
        ).first<{ count: number }>();

        return jsonResponse({
            images,
            total: countResult?.count || 0,
            limit,
            offset,
        });
    } catch (error) {
        logError("hot-list", error);
        const status = error instanceof HttpError ? error.status : 500;
        return jsonResponse({ error: "Failed to fetch images" }, status);
    }
};

// POST /api/hot - Submit a vote
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    const ip = getClientIp(request);

    try {
        enforceRateLimit(ip, 'hot-vote', 60, 60_000); // 60 votes per minute max

        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { imageId, voteType } = body as { imageId?: string; voteType?: string };

        if (!imageId) {
            throw new HttpError(400, "Image ID is required");
        }

        if (!voteType || !['hot', 'not'].includes(voteType)) {
            throw new HttpError(400, "Vote type must be 'hot' or 'not'");
        }

        // Check if image exists
        const image = await env.DB.prepare(
            'SELECT id FROM generated_images WHERE id = ?'
        ).bind(imageId).first();

        if (!image) {
            throw new HttpError(404, "Image not found");
        }

        // Check for existing vote
        const existingVote = await env.DB.prepare(
            'SELECT id, vote_type FROM image_votes WHERE image_id = ? AND voter_ip = ?'
        ).bind(imageId, ip).first<{ id: string; vote_type: string }>();

        if (existingVote) {
            if (existingVote.vote_type === voteType) {
                // Same vote - remove it (toggle off)
                await env.DB.prepare(
                    'DELETE FROM image_votes WHERE id = ?'
                ).bind(existingVote.id).run();

                return jsonResponse({ 
                    success: true, 
                    action: 'removed',
                    message: 'Vote removed' 
                });
            } else {
                // Different vote - update it
                await env.DB.prepare(
                    'UPDATE image_votes SET vote_type = ?, created_at = ? WHERE id = ?'
                ).bind(voteType, Date.now(), existingVote.id).run();

                return jsonResponse({ 
                    success: true, 
                    action: 'changed',
                    voteType,
                    message: `Changed vote to ${voteType}` 
                });
            }
        }

        // Insert new vote
        const voteId = crypto.randomUUID();
        await env.DB.prepare(
            'INSERT INTO image_votes (id, image_id, vote_type, voter_ip, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(voteId, imageId, voteType, ip, Date.now()).run();

        return jsonResponse({ 
            success: true, 
            action: 'added',
            voteType,
            message: `Voted ${voteType}!` 
        });

    } catch (error) {
        logError("hot-vote", error, { ip });
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof HttpError ? error.message : "Failed to submit vote";
        return jsonResponse({ error: message }, status);
    }
};
