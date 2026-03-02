import { GoogleGenAI } from "@google/genai";
import {
    HttpError,
    enforceRateLimit,
    getBase64FromUrl,
    getClientIp,
    getGeminiImageModel,
    jsonResponse,
    logError,
    logLLMRequest,
    logRequest,
    resizeImageIfNeeded,
    saveImageToR2AndDb,
    validatePayload,
} from "../utils";

interface ImagesTransformOptions {
    width?: number;
    height?: number;
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
    quality?: number;
}

interface ImagesOutputOptions {
    format?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';
}

interface ImagesTransformable {
    transform(options: ImagesTransformOptions): ImagesTransformable;
    output(options: ImagesOutputOptions): Promise<{ response(): Promise<Response> }>;
}

interface ImagesInfoResult {
    width: number;
    height: number;
    format: string;
}

interface ImagesBinding {
    input(data: ArrayBuffer | ReadableStream<Uint8Array>): ImagesTransformable;
    info(data: ArrayBuffer | ReadableStream<Uint8Array>): Promise<ImagesInfoResult>;
}

interface Env {
    GEMINI_API_KEY: string;
    GEMINI_IMAGE_MODEL?: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
    IMAGES?: ImagesBinding;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);
    const startTime = Date.now();
    let prompt: string | undefined;

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { prompt: bodyPrompt, referenceImage } = body as { prompt?: string; referenceImage?: string };
        prompt = bodyPrompt;

        if (!prompt) {
            throw new HttpError(400, "Prompt is required");
        }

        try {
            enforceRateLimit(ip, 'generate');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/generate',
                method: 'POST',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                prompt,
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        let base64Data = referenceImage ? getBase64FromUrl(referenceImage) : undefined;
        validatePayload(prompt, base64Data);

        // Resize large images to reduce costs and improve performance
        let resizeInfo: { wasResized: boolean; originalWidth?: number; originalHeight?: number; newWidth?: number; newHeight?: number } = { wasResized: false };
        if (base64Data && env.IMAGES) {
            try {
                const resizeResult = await resizeImageIfNeeded(env.IMAGES, base64Data);
                base64Data = resizeResult.base64Data;
                resizeInfo = {
                    wasResized: resizeResult.wasResized,
                    originalWidth: resizeResult.originalWidth,
                    originalHeight: resizeResult.originalHeight,
                    newWidth: resizeResult.newWidth,
                    newHeight: resizeResult.newHeight,
                };
                if (resizeResult.wasResized) {
                    console.log(`Resized image from ${resizeResult.originalWidth}x${resizeResult.originalHeight} to ${resizeResult.newWidth}x${resizeResult.newHeight}`);
                }
            } catch (resizeError) {
                // Log but continue with original image if resize fails
                logError('image-resize', resizeError, { endpoint: '/api/generate' });
            }
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = getGeminiImageModel(env);

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

CRITICAL REQUIREMENTS - The output MUST be an UNCOLORED coloring page:
- ONLY pure black lines (#000000) on a pure white background (#FFFFFF)
- ABSOLUTELY NO filled-in colors, shading, grayscale areas, or gradients
- ABSOLUTELY NO pre-colored sections - every area must be empty white space ready to be colored in by a child
- This is a COLORING PAGE - all shapes must be OUTLINES ONLY with hollow interiors

Style Requirements:
- OUTPUT STYLE: Clean digital vector line art, NOT a photograph of a drawing
- Clean, thick black outlines suitable for coloring with crayons or markers
- All shapes should be outlined but NOT filled in - leave interiors white/empty
- NO: Wood grain, table textures, paper textures, or physical background surfaces
- NO: Borders, frames, or edges of paper visible
- The image should look like a direct digital scan or vector export
- Subject centered with white space padding around the edges`;

        parts.push({ text: fullPrompt });

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

        // All finishReason values that indicate content was blocked/filtered
        const blockedFinishReasons = ['SAFETY', 'PROHIBITED_CONTENT', 'RECITATION', 'SPII', 'IMAGE_SAFETY', 'OTHER', 'BLOCKLIST'];
        const isBlocked = blockReason || (finishReason && blockedFinishReasons.includes(finishReason));

        if (isBlocked) {
            const reason = blockReason || finishReason || 'content_filtered';
            waitUntil(logLLMRequest(env, request, {
                requestType: 'generate',
                model,
                prompt,
                hasInputImage: !!referenceImage,
                durationMs: llmDuration,
                success: false,
                errorMessage: `Content filtered: ${reason}`
            }));
            throw new HttpError(400, "Your prompt was blocked by content filters. Please try a different, kid-friendly idea!");
        }

        if (!candidate?.content?.parts) {
            waitUntil(logLLMRequest(env, request, {
                requestType: 'generate',
                model,
                prompt,
                hasInputImage: !!referenceImage,
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
                requestType: 'generate',
                model,
                prompt,
                hasInputImage: !!referenceImage,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image data found in response'
            }));
            throw new HttpError(502, "No image data found in response");
        }

        const { id, key, publicUrl } = await saveImageToR2AndDb(env, base64Image, prompt, 'generate');

        const usageMetadata = response.usageMetadata;
        waitUntil(logLLMRequest(env, request, {
            requestType: 'generate',
            model,
            prompt,
            hasInputImage: !!referenceImage,
            durationMs: llmDuration,
            success: true,
            inputTokens: usageMetadata?.promptTokenCount,
            outputTokens: usageMetadata?.candidatesTokenCount,
            generatedImageId: id
        }));

        waitUntil(logRequest(env, request, {
            endpoint: '/api/generate',
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startTime,
            prompt,
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
            ? "Failed to generate image. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/generate',
                method: 'POST',
                statusCode: status,
                durationMs: Date.now() - startTime,
                prompt,
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("generate", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
