export interface GeneratedImage {
  id: string;
  url: string; // Data URL
  prompt: string;
  timestamp: number;
}

export enum AppView {
  GENERATOR = 'GENERATOR',
  PREVIEW = 'PREVIEW',
  EDITOR = 'EDITOR',
  CARDS = 'CARDS',
}

// Card Themes - MVP
export enum CardTheme {
  POKEMON = 'pokemon',
  CUSTOM = 'custom',
}

// Card Rarities with visual mappings
export enum CardRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

// Theme visual configuration
export interface CardThemeConfig {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
  badgeIcon: string;
  promptPrefix: string;
}

// Rarity visual configuration
export interface CardRarityConfig {
  name: string;
  borderColor: string;
  glowColor: string;
  hasShimmer: boolean;
  hasFoil: boolean;
  hasParticles: boolean;
}

// Card specification for generation
export interface CardSpec {
  prompt: string;
  theme: CardTheme;
  rarity: CardRarity;
  cardName: string;
  baseImage?: string;
}

// Extended response for card generation
export interface TradingCardResponse {
  url: string;
  previewUrl: string;
  key: string;
  cardId: string;
  theme: CardTheme;
  rarity: CardRarity;
  cardName: string;
  promptUsed: string;
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
  history: string[]; // Array of data URLs for undo
  historyStep: number;
}
