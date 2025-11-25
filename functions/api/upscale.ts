import { GoogleGenAI } from "@google/genai";
import {
    HttpError,
    enforceRateLimit,
    getBase64FromUrl,
    getClientIp,
    jsonResponse,
    logError,
    logLLMRequest,
    logRequest,
    saveImageToR2AndDb,
    validatePayload,
} from "../utils";

interface Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);
    const startTime = Date.now();

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { currentImage } = body as { currentImage?: string };

        if (!currentImage) {
            throw new HttpError(400, "Image is required");
        }

        try {
            enforceRateLimit(ip, 'upscale');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/upscale',
                method: 'POST',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                prompt: 'Upscale',
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        const base64Data = getBase64FromUrl(currentImage);
        validatePayload("Upscale", base64Data);

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-3-pro-image-preview';

        const fullPrompt = `Redraw this image in higher detail and higher quality. Maintain the exact same composition and subject, but add more subject matter details to the image. Ensure it remains black and white line art.`;

        const parts = [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Data,
                },
            },
            { text: fullPrompt },
        ];

        const llmStartTime = Date.now();
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
        const llmDuration = Date.now() - llmStartTime;

        // Check for content filtering / safety blocks
        const candidate = response.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const blockReason = response.promptFeedback?.blockReason;

        if (blockReason || finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
            const reason = blockReason || finishReason || 'content_filtered';
            waitUntil(logLLMRequest(env, request, {
                requestType: 'upscale',
                model,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: `Content filtered: ${reason}`
            }));
            throw new HttpError(400, "The image was blocked by content filters. Please try a different image!");
        }

        if (!candidate?.content?.parts) {
            waitUntil(logLLMRequest(env, request, {
                requestType: 'upscale',
                model,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image generated'
            }));
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
            waitUntil(logLLMRequest(env, request, {
                requestType: 'upscale',
                model,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image data found in response'
            }));
            throw new HttpError(502, "No image data found in response");
        }

        const { id, key, publicUrl } = await saveImageToR2AndDb(env, base64Image, 'Upscale', 'upscale');

        const usageMetadata = response.usageMetadata;
        waitUntil(logLLMRequest(env, request, {
            requestType: 'upscale',
            model,
            hasInputImage: true,
            durationMs: llmDuration,
            success: true,
            inputTokens: usageMetadata?.promptTokenCount,
            outputTokens: usageMetadata?.candidatesTokenCount,
            generatedImageId: id
        }));

        waitUntil(logRequest(env, request, {
            endpoint: '/api/upscale',
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startTime,
            prompt: 'Upscale',
            generatedImageId: id
        }));

        return jsonResponse({
            url: publicUrl,
            previewUrl: `data:image/png;base64,${base64Image}`,
            key
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to upscale image. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/upscale',
                method: 'POST',
                statusCode: status,
                durationMs: Date.now() - startTime,
                prompt: 'Upscale',
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("upscale", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
