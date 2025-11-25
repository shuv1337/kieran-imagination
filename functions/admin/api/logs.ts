import { jsonResponse } from "../../utils";
import { requireAuth } from "../auth";

interface Env {
    DB: D1Database;
}

interface LogEntry {
    id: string;
    timestamp: number;
    ip_address: string;
    endpoint: string;
    method: string;
    status_code: number;
    duration_ms: number | null;
    prompt: string | null;
    error_message: string | null;
    user_agent: string | null;
    rate_limited: number;
    generated_image_id: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const endpoint = url.searchParams.get('endpoint');
    const status = url.searchParams.get('status');
    const ip = url.searchParams.get('ip');

    try {
        let query = 'SELECT * FROM request_logs WHERE 1=1';
        const params: (string | number)[] = [];

        if (endpoint) {
            query += ' AND endpoint = ?';
            params.push(endpoint);
        }
        if (status) {
            query += ' AND status_code = ?';
            params.push(parseInt(status));
        }
        if (ip) {
            query += ' AND ip_address = ?';
            params.push(ip);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const results = await env.DB.prepare(query).bind(...params).all<LogEntry>();

        return jsonResponse({ logs: results.results ?? [] });
    } catch (error) {
        console.error('Logs error:', error);
        return jsonResponse({ error: 'Failed to fetch logs' }, 500);
    }
};
