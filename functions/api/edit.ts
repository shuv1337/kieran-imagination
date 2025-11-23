import { GoogleGenAI } from "@google/genai";
import { saveImageToR2AndDb } from "../utils";

interface Env {
    GEMINI_API_KEY: string;
    IMAGES_BUCKET: R2Bucket;
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const { currentImage, instruction } = await request.json() as { currentImage: string; instruction: string };

        if (!currentImage || !instruction) {
            return new Response("Image and instruction are required", { status: 400 });
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const model = 'gemini-3-pro-image-preview';

        const fullPrompt = `Edit the provided image with the following instruction: "${instruction}". 
    Ensure the result remains a black and white line art coloring page style. 
    Keep lines clean and background white. Return ONLY the image.`;

        const parts = [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: currentImage.split(',')[1],
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
            throw new Error("No image generated");
        }

        let base64Image = "";
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                base64Image = part.inlineData.data;
                break;
            }
        }

        if (!base64Image) {
            throw new Error("No image data found in response");
        }

        const key = await saveImageToR2AndDb(env, base64Image, instruction, 'edit');

        return new Response(JSON.stringify({
            url: `data:image/png;base64,${base64Image}`,
            key
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Edit Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
