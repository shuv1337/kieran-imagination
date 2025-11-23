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

        const { dataUrl, fileName } = body as { dataUrl?: string; fileName?: string };

        if (!dataUrl) {
            throw new HttpError(400, "Image data is required");
        }

        enforceRateLimit(ip, 'images');

        const base64Data = getBase64FromUrl(dataUrl);
        validatePayload("Manual Upload", base64Data);

        const { key, publicUrl } = await saveImageToR2AndDb(env, base64Data, "Manual Upload", 'upload', {
            originalFileName: fileName,
        });

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

        logError("images", error, { requestId, ip });
        return jsonResponse({ error: message }, status);
    }
};
