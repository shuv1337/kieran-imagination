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
    let instruction: string | undefined;

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { currentImage, instruction: bodyInstruction } = body as { currentImage?: string; instruction?: string };
        instruction = bodyInstruction;

        if (!currentImage || !instruction) {
            throw new HttpError(400, "Image and instruction are required");
        }

        try {
            enforceRateLimit(ip, 'edit');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/edit',
                method: 'POST',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                prompt: instruction,
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        let base64Data = getBase64FromUrl(currentImage);
        validatePayload(instruction, base64Data);

        // Resize large images to reduce costs and improve performance
        if (env.IMAGES) {
            try {
                const resizeResult = await resizeImageIfNeeded(env.IMAGES, base64Data);
                base64Data = resizeResult.base64Data;
                if (resizeResult.wasResized) {
                    console.log(`Resized image from ${resizeResult.originalWidth}x${resizeResult.originalHeight} to ${resizeResult.newWidth}x${resizeResult.newHeight}`);
                }
            } catch (resizeError) {
                // Log but continue with original image if resize fails
                logError('image-resize', resizeError, { endpoint: '/api/edit' });
            }
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = getGeminiImageModel(env);

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
                requestType: 'edit',
                model,
                prompt: instruction,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: `Content filtered: ${reason}`
            }));
            throw new HttpError(400, "Your edit was blocked by content filters. Please try a different instruction!");
        }

        if (!candidate?.content?.parts) {
            waitUntil(logLLMRequest(env, request, {
                requestType: 'edit',
                model,
                prompt: instruction,
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
                requestType: 'edit',
                model,
                prompt: instruction,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image data found in response'
            }));
            throw new HttpError(502, "No image data found in response");
        }

        const { id, key, publicUrl } = await saveImageToR2AndDb(env, base64Image, instruction, 'edit');

        const usageMetadata = response.usageMetadata;
        waitUntil(logLLMRequest(env, request, {
            requestType: 'edit',
            model,
            prompt: instruction,
            hasInputImage: true,
            durationMs: llmDuration,
            success: true,
            inputTokens: usageMetadata?.promptTokenCount,
            outputTokens: usageMetadata?.candidatesTokenCount,
            generatedImageId: id
        }));

        waitUntil(logRequest(env, request, {
            endpoint: '/api/edit',
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startTime,
            prompt: instruction,
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
            ? "Failed to edit image. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/edit',
                method: 'POST',
                statusCode: status,
                durationMs: Date.now() - startTime,
                prompt: instruction,
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("edit", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
