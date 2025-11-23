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

        const { currentImage, instruction } = body as { currentImage?: string; instruction?: string };

        if (!currentImage || !instruction) {
            throw new HttpError(400, "Image and instruction are required");
        }

        enforceRateLimit(ip, 'edit');

        const base64Data = getBase64FromUrl(currentImage);
        validatePayload(instruction, base64Data);

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-3-pro-image-preview';

        const fullPrompt = `Edit the provided image with the following instruction: "${instruction}". 
    Ensure the result remains a black and white line art coloring page style. 
    Keep lines clean and background white. Return ONLY the image.`;

        const parts = [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Data,
                },
            },
            { text: fullPrompt },
        ];

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

        const { key, publicUrl } = await saveImageToR2AndDb(env, base64Image, instruction, 'edit');

        return jsonResponse({
            url: publicUrl,
            previewUrl: `data:image/png;base64,${base64Image}`,
            key
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to edit image. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        logError("edit", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
