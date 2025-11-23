import { GoogleGenAI } from "@google/genai";
import { saveImageToR2AndDb } from "../utils";

interface Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const { prompt, referenceImage } = await request.json() as { prompt: string; referenceImage?: string };

        if (!prompt) {
            return new Response("Prompt is required", { status: 400 });
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-3-pro-image-preview';

        const parts: any[] = [];

        if (referenceImage) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: referenceImage.split(',')[1],
                },
            });
        }

        const fullPrompt = `Create a printable, black-and-white line art coloring page for children from this description: "${prompt}".
    Hard requirements:
    - Pure black ink on pure white paper only. NO colors, NO grayscale, NO shading.
    - Clean, thick outlines with generous negative space for coloring.
    - No photo textures, no gradients, no shadows.
    - No frames, borders, wood tables, desks, or surfaces behind/around the art.
    - No background scenery unless explicitly described; otherwise leave background white.
    - Center the subject and keep everything inside the page margins.
    Return only the coloring page image.`;

        parts.push({ text: fullPrompt });

        const response = await ai.models.generateContent({
            model,
            contents: parts,
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    aspectRatio: "3:4"
                }
            }
        });

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
            throw new Error("No image generated");
        }

        let base64Image = "";
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                base64Image = part.inlineData.data;
                break;
            }
        }

        if (!base64Image) {
            throw new Error("No image data found in response");
        }

        // Save to R2 and D1
        const key = await saveImageToR2AndDb(env, base64Image, prompt, 'generate');

        // Return the key (frontend will need to fetch it)
        // Or return the base64 for immediate display + the key?
        // Returning base64 is faster for UX.
        return new Response(JSON.stringify({
            url: `data:image/png;base64,${base64Image}`,
            key
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Generate Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
