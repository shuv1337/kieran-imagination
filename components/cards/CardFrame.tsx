import React from 'react';
import { motion } from 'framer-motion';
import { CardTheme, CardRarity } from '../../types';
import { THEME_CONFIGS, RARITY_CONFIGS } from './cardConfigs';

interface CardFrameProps {
  imageUrl: string;
  cardName: string;
  theme: CardTheme;
  rarity: CardRarity;
  className?: string;
}

export const CardFrame: React.FC<CardFrameProps> = ({
  imageUrl,
  cardName,
  className = '',
}) => {
  return (
    <div
      className={`relative aspect-[2/3] w-full max-w-sm rounded-xl overflow-hidden shadow-2xl ${className}`}
    >
      {/* Art area - Full Bleed */}
      <img
        src={imageUrl}
        alt={cardName}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export default CardFrame;
