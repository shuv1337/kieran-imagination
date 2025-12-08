export interface GeneratedImage {
  url: string; // persisted, renderable URL (proxy/public)
  key: string; // R2 key for reference/history
  previewUrl?: string; // optional base64 data URL for immediate display
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

export const fetchSuggestions = async (): Promise<string[]> => {
  const response = await fetch('/api/suggestions');

  if (!response.ok) {
    throw new Error('Failed to fetch suggestions');
  }

  const data = await response.json();
  return data.suggestions;
};

export const improvePrompt = async (prompt: string): Promise<string> => {
  const response = await fetch('/api/improve-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to improve prompt');
  }

  const data = await response.json();
  return data.improvedPrompt;
};

export const regenerateColoringPage = async (currentImage: string): Promise<GeneratedImage> => {
  const response = await fetch('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentImage,
      instruction: 'This image has coloring or shading that should not be there. Convert it into a proper black-and-white coloring page with ONLY pure black outlines on a pure white background. Remove ALL colors, shading, gradients, and filled-in areas. Every shape should be an empty outline ready to be colored in by a child.',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Regeneration failed');
  }

  return response.json();
};

// Trading Card types
export interface CardSpec {
  prompt: string;
  theme: 'pokemon' | 'custom';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  cardName: string;
  baseImage?: string;
}

export interface TradingCardResponse {
  url: string;
  previewUrl: string;
  key: string;
  cardId: string;
  theme: string;
  rarity: string;
  cardName: string;
  promptUsed: string;
}

export const generateTradingCard = async (spec: CardSpec): Promise<TradingCardResponse> => {
  const response = await fetch('/api/cards/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Card generation failed');
  }

  return response.json();
};

// Card edit actions
export type CardEditAction = 'fix-text' | 'new-attacks';

export interface CardEditResponse {
  url: string;
  previewUrl: string;
  key: string;
  action: CardEditAction;
}

export const editTradingCard = async (
  currentImage: string,
  action: CardEditAction,
  cardName: string,
  theme?: string
): Promise<CardEditResponse> => {
  const response = await fetch('/api/cards/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentImage, action, cardName, theme }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Card edit failed');
  }

  return response.json();
};

export const fixCardText = async (currentImage: string, cardName: string): Promise<CardEditResponse> => {
  return editTradingCard(currentImage, 'fix-text', cardName);
};

export const generateNewAttacks = async (
  currentImage: string, 
  cardName: string, 
  theme?: string
): Promise<CardEditResponse> => {
  return editTradingCard(currentImage, 'new-attacks', cardName, theme);
};
