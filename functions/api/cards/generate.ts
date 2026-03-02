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
    type Env,
} from "../../utils";

// Card theme and rarity types (mirrors frontend types.ts)
type CardTheme = 'pokemon' | 'custom';
type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

interface CardGenerateRequest {
    prompt: string;
    theme: CardTheme;
    rarity: CardRarity;
    cardName: string;
    baseImage?: string;
}

// Theme-specific instructions for AI prompt
const themeSpecificInstructions: Record<CardTheme, string> = {
    pokemon: 'Creature design inspired by pocket monsters - cute but powerful, elemental themes, stylized anime/cartoon aesthetic',
    custom: 'Flexible style based on user description, vibrant and appealing character design',
};

// Build the card art generation prompt
function buildCardArtPrompt(prompt: string, theme: CardTheme): string {
    return `Create a trading card character illustration based on this description: "${prompt}".

STYLE REQUIREMENTS:
- Digital illustration style suitable for a trading card game
- Vibrant colors with good contrast
- Character should be the clear focal point
- Clean edges suitable for compositing onto a card frame
- Dynamic pose or expression
- ${themeSpecificInstructions[theme]}

COMPOSITION:
- Portrait or 3/4 view of the character/subject
- Leave some space at top and bottom for card UI elements
- Centered composition
- Simple gradient or soft background (will be overlaid with card frame)

DO NOT include:
- Card borders, frames, or UI elements
- Text or labels
- Multiple characters unless specified in the prompt
- Busy or detailed backgrounds
- Watermarks or signatures`;
}

interface ExtendedEnv extends Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
}

export const onRequestPost: PagesFunction<ExtendedEnv> = async ({ request, env, waitUntil }) => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(request);
    const startTime = Date.now();
    let prompt: string | undefined;

    try {
        const body = await request.json().catch(() => {
            throw new HttpError(400, "Invalid JSON payload");
        });

        const { 
            prompt: bodyPrompt, 
            theme, 
            rarity, 
            cardName, 
            baseImage 
        } = body as CardGenerateRequest;
        
        prompt = bodyPrompt;

        // Validate required fields
        if (!prompt) {
            throw new HttpError(400, "Prompt is required");
        }
        if (!theme || !['pokemon', 'custom'].includes(theme)) {
            throw new HttpError(400, "Valid theme is required (pokemon, custom)");
        }
        if (!rarity || !['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(rarity)) {
            throw new HttpError(400, "Valid rarity is required");
        }
        if (!cardName || cardName.trim().length === 0) {
            throw new HttpError(400, "Card name is required");
        }
        if (cardName.length > 50) {
            throw new HttpError(400, "Card name must be 50 characters or less");
        }

        // Rate limiting - shared with main generate endpoint
        try {
            enforceRateLimit(ip, 'generate');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/cards/generate',
                method: 'POST',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                prompt,
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        let base64Data = baseImage ? getBase64FromUrl(baseImage) : undefined;
        validatePayload(prompt, base64Data);

        // Resize large reference images
        if (base64Data && env.IMAGES) {
            try {
                const resizeResult = await resizeImageIfNeeded(env.IMAGES, base64Data);
                base64Data = resizeResult.base64Data;
                if (resizeResult.wasResized) {
                    console.log(`Resized reference image from ${resizeResult.originalWidth}x${resizeResult.originalHeight} to ${resizeResult.newWidth}x${resizeResult.newHeight}`);
                }
            } catch (resizeError) {
                logError('image-resize', resizeError, { endpoint: '/api/cards/generate' });
            }
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = getGeminiImageModel(env);

        const parts: any[] = [];

        // Add reference image if provided
        if (baseImage && base64Data) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Data,
                },
            });
        }

        // Build the card art prompt
        const fullPrompt = buildCardArtPrompt(prompt, theme);
        parts.push({ text: fullPrompt });

        const llmStartTime = Date.now();
        const response = await ai.models.generateContent({
            model,
            contents: parts,
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    // Use 2:3 aspect ratio for card art (will be composed into 5:7 card frame)
                    aspectRatio: "2:3"
                }
            }
        });
        const llmDuration = Date.now() - llmStartTime;

        // Check for content filtering / safety blocks
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
                prompt,
                hasInputImage: !!baseImage,
                durationMs: llmDuration,
                success: false,
                errorMessage: `Content filtered: ${reason}`
            }));
            throw new HttpError(400, "Your card idea was blocked by content filters. Try describing a different character!");
        }

        if (!candidate?.content?.parts) {
            waitUntil(logLLMRequest(env, request, {
                requestType: 'card-generate',
                model,
                prompt,
                hasInputImage: !!baseImage,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image generated'
            }));
            throw new HttpError(502, "No card art generated");
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
                prompt,
                hasInputImage: !!baseImage,
                durationMs: llmDuration,
                success: false,
                errorMessage: 'No image data found in response'
            }));
            throw new HttpError(502, "No card art data found in response");
        }

        // Save to R2 with card-specific metadata
        const { id: imageId, key, publicUrl } = await saveImageToR2AndDb(
            env, 
            base64Image, 
            prompt, 
            'generate',
            {
                metadata: {
                    source: 'card-generate',
                    theme,
                    rarity,
                    cardName,
                }
            }
        );

        // Save card metadata to trading_cards table
        const cardId = crypto.randomUUID();
        try {
            await env.DB.prepare(
                `INSERT INTO trading_cards (id, generated_image_id, theme, rarity, card_name, prompt, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
                .bind(cardId, imageId, theme, rarity, cardName, prompt, Date.now())
                .run();
        } catch (dbError) {
            logError('trading-card-insert', dbError, { cardId, imageId });
            // Don't fail the request if card metadata fails to save
        }

        const usageMetadata = response.usageMetadata;
        waitUntil(logLLMRequest(env, request, {
            requestType: 'card-generate',
            model,
            prompt,
            hasInputImage: !!baseImage,
            durationMs: llmDuration,
            success: true,
            inputTokens: usageMetadata?.promptTokenCount,
            outputTokens: usageMetadata?.candidatesTokenCount,
            generatedImageId: imageId
        }));

        waitUntil(logRequest(env, request, {
            endpoint: '/api/cards/generate',
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startTime,
            prompt,
            generatedImageId: imageId
        }));

        return jsonResponse({
            url: publicUrl,
            previewUrl: `data:image/png;base64,${base64Image}`,
            key,
            cardId,
            theme,
            rarity,
            cardName,
            promptUsed: prompt,
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to generate card. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/cards/generate',
                method: 'POST',
                statusCode: status,
                durationMs: Date.now() - startTime,
                prompt,
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("card-generate", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
