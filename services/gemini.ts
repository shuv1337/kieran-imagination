import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to strip the data:image/png;base64, prefix if needed, 
// though @google/genai usually handles raw base64 or inlineData structure.
const getBase64FromUrl = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

export const generateColoringPage = async (
  prompt: string,
  referenceImage?: string
): Promise<string> => {
  const model = 'gemini-3-pro-image-preview';

  const parts: any[] = [];

  if (referenceImage) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: getBase64FromUrl(referenceImage),
      },
    });
  }

  // Engineering the prompt to ensure coloring page style
  const fullPrompt = `Create a printable, black-and-white line art coloring page for children from this description: "${prompt}".
  Hard requirements:
  - Pure black ink on pure white paper only. NO colors, NO grayscale, NO shading.
  - Clean, thick outlines with generous negative space for coloring.
  - No photo textures, no gradients, no shadows.
  - No frames, borders, wood tables, desks, or surfaces behind/around the art.
  - No background scenery unless explicitly described; otherwise leave background white.
  - Center the subject and keep everything inside the page margins.
  Return only the coloring page image.`;

  parts.push({ text: fullPrompt });

  try {
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
    const finishReason = (candidate as any)?.finishReason;
    const blockReason = (response as any)?.promptFeedback?.blockReason;
    if (finishReason === 'SAFETY' || blockReason) {
      throw new Error('SAFETY_BLOCKED');
    }

    // Extract image
    if (candidate && candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated.");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export const aiEditImage = async (
  currentImage: string,
  instruction: string
): Promise<string> => {
  const model = 'gemini-3-pro-image-preview';

  // Construct prompt for editing
  const fullPrompt = `Edit the provided image with the following instruction: "${instruction}". 
  Ensure the result remains a black and white line art coloring page style. 
  Keep lines clean and background white. Return ONLY the image.`;

  const parts = [
    {
      inlineData: {
        mimeType: 'image/png',
        data: getBase64FromUrl(currentImage),
      },
    },
    { text: fullPrompt },
  ];

  try {
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

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No edited image returned.");
  } catch (error) {
    console.error("Gemini Edit Error:", error);
    throw error;
  }
};

export const aiUpscaleImage = async (currentImage: string): Promise<string> => {
  const model = 'gemini-3-pro-image-preview';

  const fullPrompt = `Redraw this image in higher detail and higher quality. Maintain the exact same composition and subject, but add more subject matter details to the image. Ensure it remains black and white line art.`;

  const parts = [
    {
      inlineData: {
        mimeType: 'image/png',
        data: getBase64FromUrl(currentImage),
      },
    },
    { text: fullPrompt },
  ];

  try {
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

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No upscaled image returned.");
  } catch (error) {
    console.error("Gemini Upscale Error:", error);
    throw error;
  }
}
