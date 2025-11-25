import { GoogleGenAI } from "@google/genai";
import {
    HttpError,
    enforceRateLimit,
    getClientIp,
    jsonResponse,
    logError,
    MAX_PROMPT_LENGTH,
} from "../utils";

interface Env {
    GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { prompt } = body as { prompt?: string };

        if (!prompt || typeof prompt !== 'string') {
            throw new HttpError(400, "Prompt is required");
        }

        if (prompt.length > MAX_PROMPT_LENGTH) {
            throw new HttpError(413, `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters.`);
        }

        // Use a higher rate limit for this lightweight endpoint
        enforceRateLimit(ip, 'improve-prompt', 30);

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        // Use a fast model for quick text generation
        const model = 'gemini-2.0-flash';

        const systemPrompt = `You are a helpful assistant that improves prompts for generating children's coloring pages.

Your task is to take a user's rough idea and improve it to generate better coloring page results.

Guidelines for improving prompts:
- Keep it kid-friendly and appropriate for children
- Add descriptive details about the subject (pose, expression, setting)
- Suggest simple background elements that complement the subject
- Keep descriptions clear and specific but not overly complex
- Maintain the original intent and subject of the user's prompt
- Make it visually interesting but suitable for line art coloring pages
- Aim for 1-2 sentences, concise but descriptive

Examples:
- "a cat" -> "A fluffy cat sitting on a cozy cushion with a ball of yarn nearby, looking playful with big curious eyes"
- "dinosaur" -> "A friendly T-Rex standing in a prehistoric jungle with palm trees and ferns, showing a big toothy smile"
- "princess" -> "A princess in a flowing ball gown standing in front of a castle tower, wearing a sparkling tiara and holding a magic wand"

Only respond with the improved prompt text, nothing else. Do not include quotes around your response.`;

        const response = await ai.models.generateContent({
            model,
            contents: [
                { role: 'user', parts: [{ text: `Improve this coloring page prompt: "${prompt}"` }] }
            ],
            config: {
                systemInstruction: systemPrompt,
                maxOutputTokens: 200,
                temperature: 0.7,
            }
        });

        const candidate = response.candidates?.[0];
        const improvedPrompt = candidate?.content?.parts?.[0]?.text?.trim();

        if (!improvedPrompt) {
            throw new HttpError(502, "Failed to improve prompt");
        }

        return jsonResponse({ improvedPrompt });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to improve prompt. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        logError("improve-prompt", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
