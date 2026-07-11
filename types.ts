export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

export enum AppView {
  GENERATOR = 'GENERATOR',
  PREVIEW = 'PREVIEW',
  EDITOR = 'EDITOR',
  CARDS = 'CARDS',
  WORLDS = 'WORLDS',
}

// Card Themes — legacy enum kept for any residual UI; new cards use shared/cards.ts
export enum CardTheme {
  POKEMON = 'pokemon',
  CREATURE = 'creature',
  CUSTOM = 'custom',
}

export enum CardRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

export interface CardThemeConfig {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
  badgeIcon: string;
  promptPrefix: string;
}

export interface CardRarityConfig {
  name: string;
  borderColor: string;
  glowColor: string;
  hasShimmer: boolean;
  hasFoil: boolean;
  hasParticles: boolean;
}

export type ToolType = 'brush' | 'eraser' | 'fill' | 'text' | 'texture' | 'ai-edit';

export type PatternType = 'solid' | 'stripes' | 'dots' | 'grid' | 'check';

export type TextureType = 'none' | 'paper' | 'canvas' | 'watercolor';

export interface EditorState {
  activeTool: ToolType;
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  fillPattern: PatternType;
  activeTexture: TextureType;
  isDrawing: boolean;
  history: string[];
  historyStep: number;
}
