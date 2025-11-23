interface Env {
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export async function saveImageToR2AndDb(
    env: Env,
    base64Data: string,
    prompt: string,
    source: 'generate' | 'edit' | 'upscale'
): Promise<string> {
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const id = crypto.randomUUID();
    const fileName = `${id}.png`;
    const key = `generated/${new Date().toISOString().split('T')[0]}/${fileName}`;

    // Upload to R2
    await env.IMAGES_BUCKET.put(key, imageBuffer, {
        httpMetadata: { contentType: 'image/png' },
    });

    // Insert into D1
    await env.DB.prepare(
        `INSERT INTO generated_images (id, file_name, prompt, r2_key, created_at, source, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        fileName,
        prompt,
        key,
        Date.now(),
        source,
        JSON.stringify({})
    ).run();

    // Return public URL (assuming public access or we can return a signed URL if needed)
    // For now, let's assume we serve via a route or public bucket. 
    // If bucket is not public, we might need a signed URL or a proxy.
    // Let's return the key for now, or a relative URL if we have a proxy.
    // Plan mentioned: "Update /api/images to return permanent URL".
    // Let's assume we'll serve it via /api/images/view?key=... or similar if private.
    // Or just return the R2 key and let the frontend decide.
    // But the frontend expects a URL to display.
    // Let's return a constructed URL assuming a domain or just the key.
    // For simplicity in Phase 1, let's assume we can fetch it via a GET endpoint.

    return key;
}

export const getBase64FromUrl = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
};
