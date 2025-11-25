import { jsonResponse } from "../../utils";
import { requireAuth } from "../auth";

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const now = Date.now();
    const dayAgo = now - 86400000;
    const weekAgo = now - 604800000;

    try {
        const [
            totalRequests,
            todayRequests,
            totalImages,
            uniqueIps,
            rateLimited
        ] = await Promise.all([
            env.DB.prepare('SELECT COUNT(*) as count FROM request_logs').first<{ count: number }>(),
            env.DB.prepare('SELECT COUNT(*) as count FROM request_logs WHERE timestamp > ?').bind(dayAgo).first<{ count: number }>(),
            env.DB.prepare('SELECT COUNT(*) as count FROM generated_images').first<{ count: number }>(),
            env.DB.prepare('SELECT COUNT(DISTINCT ip_address) as count FROM request_logs WHERE timestamp > ?').bind(weekAgo).first<{ count: number }>(),
            env.DB.prepare('SELECT COUNT(*) as count FROM request_logs WHERE rate_limited = 1 AND timestamp > ?').bind(dayAgo).first<{ count: number }>()
        ]);

        return jsonResponse({
            totalRequests: totalRequests?.count ?? 0,
            todayRequests: todayRequests?.count ?? 0,
            totalImages: totalImages?.count ?? 0,
            uniqueIpsWeek: uniqueIps?.count ?? 0,
            rateLimitedToday: rateLimited?.count ?? 0
        });
    } catch (error) {
        console.error('Stats error:', error);
        return jsonResponse({ error: 'Failed to fetch stats' }, 500);
    }
};
