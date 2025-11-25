import { GoogleGenAI } from "@google/genai";
import { HttpError, enforceRateLimit, getClientIp, jsonResponse, logError, logRequest } from "../utils";

interface Env {
    GEMINI_API_KEY: string;
    DB: D1Database;
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

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-2.0-flash';

        const response = await ai.models.generateContent({
            model,
            contents: `Generate 5 fun, creative, and kid-friendly coloring page ideas. Each should be imaginative and appealing to children ages 4-10.

Return ONLY a JSON array of strings, each being a short creative prompt (5-8 words max). Include a relevant emoji at the start of each.

Examples of good ideas:
- "🦖 A T-Rex playing guitar"
- "🧙‍♂️ A wizard cat casting spells"
- "🚀 A hamster astronaut on the moon"

Be creative and varied! Mix animals, fantasy, vehicles, food, nature, and silly scenarios. Avoid repeating themes.

Return ONLY the JSON array, no other text.`,
        });

        const text = response.text?.trim() || '';
        
        // Parse the JSON response
        let suggestions: string[];
        try {
            // Handle potential markdown code blocks
            const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
            suggestions = JSON.parse(jsonStr);
            
            if (!Array.isArray(suggestions) || suggestions.length === 0) {
                throw new Error('Invalid response format');
            }
        } catch {
            // Fallback suggestions if parsing fails
            suggestions = [
                '🦄 A unicorn in a flower garden',
                '🐙 An octopus playing drums',
                '🏰 A dragon guarding a castle',
                '🚂 A train made of candy',
                '🐱 A cat wizard with a wand'
            ];
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
            ? "Failed to generate suggestions."
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
