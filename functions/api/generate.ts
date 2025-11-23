import { GoogleGenAI } from "@google/genai";
import {
    HttpError,
    enforceRateLimit,
    getBase64FromUrl,
    getClientIp,
    jsonResponse,
    logError,
    saveImageToR2AndDb,
    validatePayload,
} from "../utils";

interface Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { prompt, referenceImage } = body as { prompt?: string; referenceImage?: string };

        if (!prompt) {
            throw new HttpError(400, "Prompt is required");
        }

        enforceRateLimit(ip, 'generate');

        const base64Data = referenceImage ? getBase64FromUrl(referenceImage) : undefined;
        validatePayload(prompt, base64Data);

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-3-pro-image-preview';

        const parts: any[] = [];

        if (referenceImage && base64Data) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Data,
                },
            });
        }

        const fullPrompt = `Create a printable, black-and-white line art coloring page for children from this description: "${prompt}".
    Strict Style Requirements:
    - OUTPUT STYLE: Digital vector line art. NOT a photograph of a drawing.
    - CONTENT: Pure black lines on a pure white (#FFFFFF) background.
    - NO: Grayscale, shading, gradients, or colors.
    - NO: Wood grain, table textures, paper textures, or physical background surfaces.
    - NO: Borders, frames, or edges of paper visible.
    - The image should look like a direct digital scan or vector export, not a photo taken with a camera.
    - Clean, thick outlines suitable for coloring.
    - Subject centered with white space padding around the edges.`;

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
            throw new HttpError(502, "No image generated");
        }

        let base64Image = "";
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                base64Image = part.inlineData.data;
                break;
            }
        }

        if (!base64Image) {
            throw new HttpError(502, "No image data found in response");
        }

        const { key, publicUrl } = await saveImageToR2AndDb(env, base64Image, prompt, 'generate');

        return jsonResponse({
            url: publicUrl,
            previewUrl: `data:image/png;base64,${base64Image}`,
            key
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to generate image. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        logError("generate", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
