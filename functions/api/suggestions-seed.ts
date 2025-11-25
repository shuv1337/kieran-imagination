import { GoogleGenAI } from "@google/genai";
import { HttpError, jsonResponse, logError, logLLMRequest } from "../utils";

interface Env {
    GEMINI_API_KEY: string;
    DB: D1Database;
    SUGGESTIONS_SEED_KEY?: string;
}

const BATCH_SIZE = 50; // Generate 50 suggestions per LLM call
const TARGET_COUNT = 500; // Target total suggestions in pool
const MAX_SERVE_COUNT = 10; // Suggestions are considered "active" until served to this many IPs

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
    const requestId = crypto.randomUUID();

    try {
        // Simple auth check - require a secret key
        const authHeader = request.headers.get('Authorization');
        const expectedKey = env.SUGGESTIONS_SEED_KEY || 'dev-seed-key';
        
        if (authHeader !== `Bearer ${expectedKey}`) {
            throw new HttpError(401, 'Unauthorized');
        }

        // Check how many active suggestions we have (not yet served to max IPs)
        const countResult = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM suggestions WHERE serve_count < ?'
        ).bind(MAX_SERVE_COUNT).first<{ count: number }>();
        
        const activeCount = countResult?.count || 0;
        const neededCount = TARGET_COUNT - activeCount;

        if (neededCount <= 0) {
            return jsonResponse({ 
                message: 'Pool is full',
                activeCount,
                targetCount: TARGET_COUNT,
                generated: 0
            });
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-2.0-flash';
        
        let totalGenerated = 0;
        let totalDuplicates = 0;
        const batchesNeeded = Math.ceil(neededCount / BATCH_SIZE);

        for (let batch = 0; batch < batchesNeeded && totalGenerated < neededCount; batch++) {
            const llmStartTime = Date.now();
            
            const response = await ai.models.generateContent({
                model,
                contents: `Generate ${BATCH_SIZE} fun, creative, and kid-friendly coloring page ideas. Each should be imaginative and appealing to children ages 4-10.

Return ONLY a JSON array of strings, each being a short creative prompt (5-8 words max). Include a relevant emoji at the start of each.

Examples of good ideas:
- "🦖 A T-Rex playing guitar"
- "🧙‍♂️ A wizard cat casting spells"
- "🚀 A hamster astronaut on the moon"
- "🎪 A circus elephant juggling cupcakes"
- "🌈 A rainbow bridge to candy land"

Be VERY creative and varied! Mix themes like:
- Animals doing human activities
- Fantasy creatures and magic
- Vehicles and transportation
- Food and treats
- Nature and seasons
- Silly scenarios and mashups
- Space and underwater adventures
- Sports and hobbies

Make each suggestion unique and delightful. Avoid generic or boring ideas. Each prompt should paint a vivid picture in a child's mind.

Return ONLY the JSON array, no other text.`,
            });
            
            const llmDuration = Date.now() - llmStartTime;
            const text = response.text?.trim() || '';

            let suggestions: string[];
            let parseFailed = false;
            
            try {
                const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
                suggestions = JSON.parse(jsonStr);

                if (!Array.isArray(suggestions) || suggestions.length === 0) {
                    throw new Error('Invalid response format');
                }
            } catch {
                parseFailed = true;
                suggestions = [];
            }

            const usageMetadata = response.usageMetadata;
            waitUntil(logLLMRequest(env, request, {
                requestType: 'suggestions-seed',
                model,
                durationMs: llmDuration,
                success: !parseFailed,
                errorMessage: parseFailed ? 'Parse failed' : undefined,
                inputTokens: usageMetadata?.promptTokenCount,
                outputTokens: usageMetadata?.candidatesTokenCount
            }));

            // Insert suggestions, ignoring duplicates
            for (const suggestion of suggestions) {
                if (typeof suggestion !== 'string' || suggestion.trim().length === 0) continue;
                
                try {
                    await env.DB.prepare(
                        'INSERT OR IGNORE INTO suggestions (text) VALUES (?)'
                    ).bind(suggestion.trim()).run();
                    totalGenerated++;
                } catch (e) {
                    // Duplicate or other error
                    totalDuplicates++;
                }
            }

            // Small delay between batches to avoid rate limits
            if (batch < batchesNeeded - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Get final count
        const finalCountResult = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM suggestions WHERE serve_count < ?'
        ).bind(MAX_SERVE_COUNT).first<{ count: number }>();

        return jsonResponse({
            message: 'Seeding complete',
            previousActiveCount: activeCount,
            generated: totalGenerated,
            duplicatesSkipped: totalDuplicates,
            currentActiveCount: finalCountResult?.count || 0
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof Error ? error.message : "Seeding failed";

        logError("suggestions-seed", error, { requestId });
        return jsonResponse({ error: message }, status);
    }
};
