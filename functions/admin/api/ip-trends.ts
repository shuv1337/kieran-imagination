import { jsonResponse } from "../../utils";
import { requireAuth } from "../auth";

interface Env {
    DB: D1Database;
}

interface IpTrend {
    ip_address: string;
    request_count: number;
    rate_limited_count: number;
    last_seen: number;
    first_seen: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const since = parseInt(url.searchParams.get('since') || '0');

    try {
        const results = await env.DB.prepare(`
            SELECT
                ip_address,
                COUNT(*) as request_count,
                COUNT(CASE WHEN rate_limited = 1 THEN 1 END) as rate_limited_count,
                MAX(timestamp) as last_seen,
                MIN(timestamp) as first_seen
            FROM request_logs
            WHERE timestamp > ?
            GROUP BY ip_address
            ORDER BY request_count DESC
            LIMIT ?
        `).bind(since, limit).all<IpTrend>();

        return jsonResponse({ ipTrends: results.results ?? [] });
    } catch (error) {
        console.error('IP trends error:', error);
        return jsonResponse({ error: 'Failed to fetch IP trends' }, 500);
    }
};
