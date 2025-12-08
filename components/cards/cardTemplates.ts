import { CardTheme, CardRarity } from '../../types';

export interface CardTemplate {
  id: string;
  name: string;
  prompt: string;
  theme: CardTheme;
  suggestedRarity: CardRarity;
  previewEmoji: string;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'fire-dragon',
    name: 'Fire Dragon',
    prompt: 'A fierce fire-breathing dragon with glowing orange and red scales, flames dancing around its wings',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.RARE,
    previewEmoji: '🐉',
  },
  {
    id: 'water-turtle',
    name: 'Water Turtle',
    prompt: 'A wise water turtle with a shell covered in beautiful coral and seashells, surrounded by bubbles',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.UNCOMMON,
    previewEmoji: '🐢',
  },
  {
    id: 'electric-mouse',
    name: 'Spark Mouse',
    prompt: 'An adorable electric mouse with bright yellow fur and red cheek pouches crackling with electricity',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.COMMON,
    previewEmoji: '🐭',
  },
  {
    id: 'grass-flower',
    name: 'Bloom Fox',
    prompt: 'A graceful fox creature with flowers blooming from its tail and vines wrapped around its legs',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.UNCOMMON,
    previewEmoji: '🦊',
  },
  {
    id: 'ice-phoenix',
    name: 'Frost Phoenix',
    prompt: 'A majestic phoenix made of crystalline ice, with feathers that shimmer like frozen snow',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.EPIC,
    previewEmoji: '🦅',
  },
  {
    id: 'shadow-wolf',
    name: 'Shadow Wolf',
    prompt: 'A mysterious wolf with dark purple fur that seems to blend into shadows, glowing violet eyes',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.RARE,
    previewEmoji: '🐺',
  },
  {
    id: 'cosmic-cat',
    name: 'Cosmic Cat',
    prompt: 'A magical cat with fur that looks like the night sky, filled with stars and galaxies',
    theme: CardTheme.CUSTOM,
    suggestedRarity: CardRarity.LEGENDARY,
    previewEmoji: '🐱',
  },
  {
    id: 'robot-buddy',
    name: 'Robo Buddy',
    prompt: 'A friendly robot companion with a round body, expressive LED eyes, and small propeller on top',
    theme: CardTheme.CUSTOM,
    suggestedRarity: CardRarity.COMMON,
    previewEmoji: '🤖',
  },
];
