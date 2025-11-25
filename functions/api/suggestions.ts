import { GoogleGenAI } from "@google/genai";
import { HttpError, enforceRateLimit, getClientIp, jsonResponse, logError } from "../utils";

interface Env {
    GEMINI_API_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);

    try {
        enforceRateLimit(ip, 'suggestions');

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

        return jsonResponse({ suggestions });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to generate suggestions."
            : (error instanceof Error ? error.message : "Request failed.");

        logError("suggestions", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
