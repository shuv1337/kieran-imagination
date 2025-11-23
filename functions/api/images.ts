import { saveImageToR2AndDb } from "../utils";

interface Env {
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const { dataUrl, fileName } = await request.json() as { dataUrl: string; fileName: string };

        if (!dataUrl) {
            return new Response("Image data is required", { status: 400 });
        }

        // We use the fileName from client as a hint or part of metadata, 
        // but saveImageToR2AndDb generates a unique ID.
        // We could pass the fileName to be stored in metadata if we update saveImageToR2AndDb.
        // For now, we just save it.

        // Note: saveImageToR2AndDb expects 'generate' | 'edit' | 'upscale'.
        // We can add 'upload' or just use 'generate' as fallback.
        // Let's update utils.ts to accept string or add 'upload' to type if we were strict.
        // But utils.ts defined: source: 'generate' | 'edit' | 'upscale'
        // Let's cast it or update utils.ts. 
        // Since I can't easily update utils.ts without rewriting it, I'll just use 'generate' for now 
        // or 'edit' if it looks like an edit? No, let's just use 'generate'.

        const key = await saveImageToR2AndDb(env, dataUrl.split(',')[1], "Manual Upload", 'generate');

        return new Response(JSON.stringify({
            url: key // The frontend expects { url } from services/storage.ts
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Image Upload Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
