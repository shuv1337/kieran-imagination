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
    resizeImageIfNeeded,
    saveImageToR2AndDb,
    validatePayload,
    type Env,
} from "../../utils";

type CardEditAction = 'fix-text' | 'new-attacks';

interface CardEditRequest {
    currentImage: string;
    action: CardEditAction;
    cardName: string;
    theme?: string;
}

// Prompts for different edit actions
const ACTION_PROMPTS: Record<CardEditAction, (cardName: string, theme?: string) => string> = {
    'fix-text': (cardName: string) => `This is a trading card image for a character called "${cardName}". 
The text on the card (attack names, descriptions, stats) contains garbled or nonsensical characters.

TASK: Fix ALL text on this card to be legible, proper English that makes sense for a trading card game.
- Attack names should be short, punchy, and thematic (e.g., "Fire Blast", "Thunder Strike", "Vine Whip")
- Attack descriptions should be brief and describe what the attack does (e.g., "Deals 30 damage", "Heals 10 HP")
- Any stats or numbers should be clear and readable
- Keep the same visual style, colors, and layout - ONLY fix the text
- Ensure all text is crisp and easy to read

Return the corrected card image.`,

    'new-attacks': (cardName: string, theme?: string) => `This is a trading card image for a character called "${cardName}"${theme ? ` with a ${theme} theme` : ''}.

TASK: Generate NEW attack moves and descriptions for this card while keeping the same artwork and layout.
- Create 2-3 creative attack names that fit the character's appearance and theme
- Each attack should have a short, clear description and damage/effect value
- Attack names should be exciting and memorable (e.g., "Shadow Strike", "Inferno Breath", "Crystal Shield")
- Descriptions should be brief but flavorful (e.g., "Engulfs the enemy in flames. Deals 40 damage.")
- Keep all other visual elements the same - same artwork, borders, card name, etc.
- Ensure the new text is crisp, clear, and properly formatted

Return the card with the new attacks.`,
};

interface ExtendedEnv extends Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
}

export const onRequestPost: PagesFunction<ExtendedEnv> = async ({ request, env, waitUntil }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);
    const startTime = Date.now();
    let action: CardEditAction | undefined;

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { 
            currentImage, 
            action: bodyAction, 
            cardName,
            theme 
        } = body as CardEditRequest;
        
        action = bodyAction;

        if (!currentImage) {
            throw new HttpError(400, "Image is required");
        }
        if (!action || !['fix-text', 'new-attacks'].includes(action)) {
            throw new HttpError(400, "Valid action is required (fix-text, new-attacks)");
        }
        if (!cardName) {
            throw new HttpError(400, "Card name is required");
        }

        // Rate limiting - shared with edit endpoint
        try {
            enforceRateLimit(ip, 'edit');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/cards/edit',
                method: 'POST',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                prompt: action,
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        let base64Data = getBase64FromUrl(currentImage);
        validatePayload(action, base64Data);

        // Resize large images
        if (env.IMAGES) {
            try {
                const resizeResult = await resizeImageIfNeeded(env.IMAGES, base64Data);
                base64Data = resizeResult.base64Data;
                if (resizeResult.wasResized) {
                    console.log(`Resized image from ${resizeResult.originalWidth}x${resizeResult.originalHeight} to ${resizeResult.newWidth}x${resizeResult.newHeight}`);
                }
            } catch (resizeError) {
                logError('image-resize', resizeError, { endpoint: '/api/cards/edit' });
            }
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-3-pro-image-preview';

        const prompt = ACTION_PROMPTS[action](cardName, theme);

        const parts = [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Data,
                },
            },
            { text: prompt },
        ];

        const llmStartTime = Date.now();
        const response = await ai.models.generateContent({
            model,
            contents: parts,
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    aspectRatio: "2:3"
                }
            }
        });
        const llmDuration = Date.now() - llmStartTime;

        // Check for content filtering
        const candidate = response.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const blockReason = response.promptFeedback?.blockReason;

        const blockedFinishReasons = ['SAFETY', 'PROHIBITED_CONTENT', 'RECITATION', 'SPII', 'IMAGE_SAFETY', 'OTHER', 'BLOCKLIST'];
        const isBlocked = blockReason || (finishReason && blockedFinishReasons.includes(finishReason));

        if (isBlocked) {
            const reason = blockReason || finishReason || 'content_filtered';
            waitUntil(logLLMRequest(env, request, {
                requestType: 'card-generate',
                model,
                prompt: action,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: `Content filtered: ${reason}`
            }));
            throw new HttpError(400, "Your edit was blocked by content filters. Please try again.");
        }

        if (!candidate?.content?.parts) {
            waitUntil(logLLMRequest(env, request, {
                requestType: 'card-generate',
                model,
                prompt: action,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image generated'
            }));
            throw new HttpError(502, "No edited image generated");
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
                requestType: 'card-generate',
                model,
                prompt: action,
                hasInputImage: true,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image data found in response'
            }));
            throw new HttpError(502, "No image data found in response");
        }

        const { id, key, publicUrl } = await saveImageToR2AndDb(
            env, 
            base64Image, 
            `card-edit-${action}`, 
            'edit',
            {
                metadata: {
                    source: 'card-edit',
                    action,
                    cardName,
                }
            }
        );

        const usageMetadata = response.usageMetadata;
        waitUntil(logLLMRequest(env, request, {
            requestType: 'card-generate',
            model,
            prompt: action,
            hasInputImage: true,
            durationMs: llmDuration,
            success: true,
            inputTokens: usageMetadata?.promptTokenCount,
            outputTokens: usageMetadata?.candidatesTokenCount,
            generatedImageId: id
        }));

        waitUntil(logRequest(env, request, {
            endpoint: '/api/cards/edit',
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startTime,
            prompt: action,
            generatedImageId: id
        }));

        return jsonResponse({
            url: publicUrl,
            previewUrl: `data:image/png;base64,${base64Image}`,
            key,
            action,
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to edit card. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/cards/edit',
                method: 'POST',
                statusCode: status,
                durationMs: Date.now() - startTime,
                prompt: action,
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("card-edit", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
