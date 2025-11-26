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
    hot_score: number;
}

/**
 * Wilson Score Lower Bound
 * 
 * Provides a statistically confident score for items with varying vote counts.
 * Unlike simple ratios (upvotes/total), this handles the uncertainty when
 * there are few votes. An item with 1 upvote out of 1 total won't rank above
 * an item with 100 upvotes out of 110.
 * 
 * z = 1.96 for 95% confidence interval
 */
function wilsonScore(upvotes: number, downvotes: number, z: number = 1.96): number {
    const n = upvotes + downvotes;
    if (n === 0) return 0;
    
    const p = upvotes / n;
    const zsq = z * z;
    
    // Wilson score lower bound formula
    const numerator = p + zsq / (2 * n) - z * Math.sqrt((p * (1 - p) + zsq / (4 * n)) / n);
    const denominator = 1 + zsq / n;
    
    return numerator / denominator;
}

/**
 * Hot Score Algorithm (inspired by Reddit/HN)
 * 
 * Combines Wilson Score confidence with time decay to surface newer content.
 * 
 * Components:
 * 1. Wilson Score: Statistically confident rating (0-1)
 * 2. Time Boost: Newer images get a logarithmic boost that decays over time
 * 3. New Item Boost: Items with <3 votes get extra visibility
 * 
 * @param upvotes - Number of "hot" votes
 * @param downvotes - Number of "not" votes  
 * @param createdAt - Timestamp when image was created
 * @param now - Current timestamp
 * @returns Combined hot score for ranking
 */
function calculateHotScore(
    upvotes: number,
    downvotes: number,
    createdAt: number,
    now: number
): number {
    const totalVotes = upvotes + downvotes;
    
    // 1. Base score from Wilson confidence (0-1 range)
    const wilson = wilsonScore(upvotes, downvotes);
    
    // 2. Time factor: hours since creation
    const hoursOld = Math.max(0, (now - createdAt) / (1000 * 60 * 60));
    
    // 3. Time decay: newer items score higher
    // After 72 hours (3 days), time boost is minimal
    // Formula: timeBoost = 1 / (1 + hoursOld / halfLife)
    const halfLife = 24; // 24 hours half-life
    const timeBoost = 1 / (1 + hoursOld / halfLife);
    
    // 4. New item bonus: items with few votes get extra visibility
    // This ensures new uploads appear on the first page
    const newItemBonus = totalVotes < 3 ? 0.3 * (1 - totalVotes / 3) : 0;
    
    // 5. Engagement bonus: more total votes = more interesting
    // Logarithmic to prevent runaway scores
    const engagementBonus = totalVotes > 0 ? Math.log10(1 + totalVotes) * 0.1 : 0;
    
    // Combine: wilson (0-1) + timeBoost (0-1) + newItemBonus (0-0.3) + engagementBonus
    // Weight wilson more heavily as votes accumulate
    const wilsonWeight = Math.min(0.7, 0.3 + totalVotes * 0.04); // 0.3 -> 0.7 as votes increase
    const timeWeight = 1 - wilsonWeight;
    
    return (wilson * wilsonWeight) + (timeBoost * timeWeight) + newItemBonus + engagementBonus;
}

// GET /api/hot - Get images sorted by hot score (Wilson + time decay)
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const ip = getClientIp(request);
        const now = Date.now();

        // Get ALL images with vote counts (we need to calculate hot_score in JS)
        // D1 doesn't support complex math functions like sqrt/log needed for Wilson score
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
        `).bind(ip).all();

        // Calculate hot_score for each image and sort
        const allImages: ImageWithRating[] = (result.results || []).map((row: any) => {
            const hotScore = calculateHotScore(
                row.hot_votes,
                row.not_votes,
                row.created_at,
                now
            );
            return {
                id: row.id,
                url: buildPublicUrl(row.r2_key),
                prompt: row.prompt,
                created_at: row.created_at,
                hot_votes: row.hot_votes,
                not_votes: row.not_votes,
                rating: row.rating,
                total_votes: row.total_votes,
                user_vote: row.user_vote,
                hot_score: hotScore,
            };
        });

        // Sort by hot_score descending
        allImages.sort((a, b) => b.hot_score - a.hot_score);

        // Apply pagination
        const paginatedImages = allImages.slice(offset, offset + limit);

        return jsonResponse({
            images: paginatedImages,
            total: allImages.length,
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
