import { CardTheme, CardRarity, CardThemeConfig, CardRarityConfig } from '../../types';

export const THEME_CONFIGS: Record<CardTheme, CardThemeConfig> = {
  [CardTheme.POKEMON]: {
    name: 'Creature Card',
    primaryColor: '#FFD700',
    secondaryColor: '#FF6B6B',
    gradientFrom: 'from-yellow-400',
    gradientTo: 'to-orange-500',
    badgeIcon: 'Zap',
    promptPrefix: 'pocket monster creature',
  },
  [CardTheme.CUSTOM]: {
    name: 'Custom Card',
    primaryColor: '#8B5CF6',
    secondaryColor: '#EC4899',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-pink-500',
    badgeIcon: 'Star',
    promptPrefix: '',
  },
};

export const RARITY_CONFIGS: Record<CardRarity, CardRarityConfig> = {
  [CardRarity.COMMON]: {
    name: 'Common',
    borderColor: 'border-slate-400',
    glowColor: '',
    hasShimmer: false,
    hasFoil: false,
    hasParticles: false,
  },
  [CardRarity.UNCOMMON]: {
    name: 'Uncommon',
    borderColor: 'border-green-500',
    glowColor: 'shadow-green-400/30',
    hasShimmer: false,
    hasFoil: false,
    hasParticles: false,
  },
  [CardRarity.RARE]: {
    name: 'Rare',
    borderColor: 'border-blue-500',
    glowColor: 'shadow-blue-400/40',
    hasShimmer: true,
    hasFoil: false,
    hasParticles: false,
  },
  [CardRarity.EPIC]: {
    name: 'Epic',
    borderColor: 'border-purple-500',
    glowColor: 'shadow-purple-400/50',
    hasShimmer: true,
    hasFoil: true,
    hasParticles: false,
  },
  [CardRarity.LEGENDARY]: {
    name: 'Legendary',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-yellow-400/50',
    hasShimmer: true,
    hasFoil: true,
    hasParticles: true,
  },
};
