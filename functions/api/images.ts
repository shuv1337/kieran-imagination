import {
    HttpError,
    enforceRateLimit,
    getBase64FromUrl,
    getClientIp,
    jsonResponse,
    logError,
    logRequest,
    saveImageToR2AndDb,
    validatePayload,
} from "../utils";

interface Env {
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

        const { dataUrl, fileName } = body as { dataUrl?: string; fileName?: string };

        if (!dataUrl) {
            throw new HttpError(400, "Image data is required");
        }

        try {
            enforceRateLimit(ip, 'images');
        } catch (error) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/images',
                method: 'POST',
                statusCode: 429,
                durationMs: Date.now() - startTime,
                prompt: 'Manual Upload',
                rateLimited: true,
                errorMessage: 'Rate limited'
            }));
            throw error;
        }

        const base64Data = getBase64FromUrl(dataUrl);
        validatePayload("Manual Upload", base64Data);

        const { id, key, publicUrl } = await saveImageToR2AndDb(env, base64Data, "Manual Upload", 'upload', {
            originalFileName: fileName,
        });

        waitUntil(logRequest(env, request, {
            endpoint: '/api/images',
            method: 'POST',
            statusCode: 200,
            durationMs: Date.now() - startTime,
            prompt: 'Manual Upload',
            generatedImageId: id
        }));

        return jsonResponse({
            url: publicUrl,
            previewUrl: dataUrl,
            key,
        });

    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = status >= 500
            ? "Failed to upload image. Please try again."
            : (error instanceof Error ? error.message : "Request failed.");

        if (status !== 429) {
            waitUntil(logRequest(env, request, {
                endpoint: '/api/images',
                method: 'POST',
                statusCode: status,
                durationMs: Date.now() - startTime,
                prompt: 'Manual Upload',
                errorMessage: error instanceof Error ? error.message : String(error)
            }));
        }

        logError("images", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
