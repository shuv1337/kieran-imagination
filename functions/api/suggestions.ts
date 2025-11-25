import { HttpError, enforceRateLimit, getClientIp, jsonResponse, logError, logRequest } from "../utils";

interface Env {
    DB: D1Database;
}

interface SuggestionRow {
    id: number;
    text: string;
}

const SUGGESTIONS_COUNT = 5;
const MAX_SERVE_COUNT = 10; // Retire suggestion after served to this many unique IPs

// Fallback suggestions if database is empty
const FALLBACK_SUGGESTIONS = [
    '🦄 A unicorn in a flower garden',
    '🐙 An octopus playing drums',
    '🏰 A dragon guarding a castle',
    '🚂 A train made of candy',
    '🐱 A cat wizard with a wand'
];

async function hashIp(ip: string): Promise<string> {
    const data = new TextEncoder().encode(ip + '_suggestions_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);
    const startTime = Date.now();

    try {
        try {
            enforceRateLimit(ip, 'suggestions');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/suggestions',
                method: 'GET',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        const ipHash = await hashIp(ip);

        // Fetch random suggestions that:
        // 1. Haven't been served to this IP yet
        // 2. Haven't exceeded the max serve count
        const results = await env.DB.prepare(
            `SELECT s.id, s.text FROM suggestions s
             WHERE s.serve_count < ?
               AND s.id NOT IN (
                 SELECT suggestion_id FROM suggestion_serves WHERE ip_hash = ?
               )
             ORDER BY RANDOM()
             LIMIT ?`
        ).bind(MAX_SERVE_COUNT, ipHash, SUGGESTIONS_COUNT).all<SuggestionRow>();

        let suggestions: string[];
        const suggestionIds: number[] = [];

        if (results.results && results.results.length > 0) {
            suggestions = results.results.map(row => row.text);
            suggestionIds.push(...results.results.map(row => row.id));

            // Record that we served these suggestions to this IP
            waitUntil((async () => {
                try {
                    for (const id of suggestionIds) {
                        // Insert serve record (ignore if already exists)
                        await env.DB.prepare(
                            `INSERT OR IGNORE INTO suggestion_serves (suggestion_id, ip_hash) VALUES (?, ?)`
                        ).bind(id, ipHash).run();
                        
                        // Increment serve count
                        await env.DB.prepare(
                            `UPDATE suggestions SET serve_count = serve_count + 1 WHERE id = ?`
                        ).bind(id).run();
                    }
                } catch (err) {
                    logError('suggestions-track-serve', err, { ids: suggestionIds, ipHash });
                }
            })());
        } else {
            // No fresh suggestions for this IP, use fallback
            suggestions = FALLBACK_SUGGESTIONS;
        }

        waitUntil(logRequest(env, request, {
            endpoint: '/api/suggestions',
            method: 'GET',
            statusCode: 200,
            durationMs: Date.now() - startTime
        }));

        return jsonResponse({ suggestions });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to fetch suggestions."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/suggestions',
                method: 'GET',
                statusCode: status,
                durationMs: Date.now() - startTime,
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("suggestions", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
