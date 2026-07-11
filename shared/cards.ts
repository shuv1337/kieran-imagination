export type CardTheme = 'creature' | 'custom';
export type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type CardLayout = 'standard-5x7-v1';

export interface CardMove {
  id: string;
  name: string;
  description: string;
  power?: number;
  cost?: string[];
}

export interface CardDocumentV1 {
  schemaVersion: 1;
  name: string;
  typeLabel?: string;
  hp?: number;
  moves: CardMove[];
  flavorText?: string;
  artworkPlacement: {
    focalX: number;
    focalY: number;
    zoom: number;
  };
  presentation: {
    theme: CardTheme;
    rarity: CardRarity;
    layout: CardLayout;
  };
}

export interface CardDocument {
  id: string;
  worldId: string;
  title: string;
  currentRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CardRevision {
  id: string;
  cardId: string;
  parentRevisionId: string | null;
  artworkRevisionId: string | null;
  sourceJobId: string | null;
  schemaVersion: number;
  document: CardDocumentV1;
  createdAt: number;
}

export function defaultCardDocument(name = 'New Card'): CardDocumentV1 {
  return {
    schemaVersion: 1,
    name,
    typeLabel: 'Creature',
    hp: 100,
    moves: [
      {
        id: 'move-spark',
        name: 'Spark',
        description: 'A bright flash of imagination.',
        power: 20,
      },
    ],
    flavorText: '',
    artworkPlacement: { focalX: 0.5, focalY: 0.45, zoom: 1 },
    presentation: {
      theme: 'creature',
      rarity: 'common',
      layout: 'standard-5x7-v1',
    },
  };
}

/** Map legacy pokemon theme to creature when importing. */
export function mapLegacyTheme(theme: string): CardTheme {
  if (theme === 'pokemon' || theme === 'creature') return 'creature';
  return 'custom';
}

export const CARD_DESIGN_WIDTH = 500;
export const CARD_DESIGN_HEIGHT = 700;
export const CARD_EXPORT_SCALE = 3;
export const CARD_EXPORT_WIDTH = CARD_DESIGN_WIDTH * CARD_EXPORT_SCALE; // 1500
export const CARD_EXPORT_HEIGHT = CARD_DESIGN_HEIGHT * CARD_EXPORT_SCALE; // 2100
