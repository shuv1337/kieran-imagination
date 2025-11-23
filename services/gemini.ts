import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
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
  const model = 'gemini-2.5-flash-image';
  
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
  const fullPrompt = `Create a high-quality, black and white line art coloring page for children based on this description: "${prompt}". 
  The image should have clean, thick distinct outlines, a pure white background, and NO grayscale shading or colors. 
  It should be suitable for printing and coloring on 8.5x11 paper.`;

  parts.push({ text: fullPrompt });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: "3:4"
        }
      }
    });

    // Extract image
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
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
  const model = 'gemini-2.5-flash-image';

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
      contents: { parts },
      config: {
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
    const model = 'gemini-2.5-flash-image';

    const fullPrompt = `Redraw this image in higher detail and higher quality. Maintain the exact same composition and subject, but make the lines crisper and cleaner. Ensure it remains black and white line art.`;

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
            contents: { parts },
            config: {
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