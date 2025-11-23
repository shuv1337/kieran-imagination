export interface GeneratedImage {
  url: string;
  key: string;
}

export const generateColoringPage = async (
  prompt: string,
  referenceImage?: string
): Promise<GeneratedImage> => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, referenceImage }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Generation failed');
  }

  return response.json();
};

export const aiEditImage = async (
  currentImage: string,
  instruction: string
): Promise<GeneratedImage> => {
  const response = await fetch('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentImage, instruction }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Edit failed');
  }

  return response.json();
};

export const aiUpscaleImage = async (currentImage: string): Promise<GeneratedImage> => {
  const response = await fetch('/api/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentImage }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Upscale failed');
  }

  return response.json();
};
