import React from 'react';
import { motion } from 'framer-motion';
import { CardRarity } from '../../types';
import { RARITY_CONFIGS } from './cardConfigs';

interface CardRaritySelectorProps {
  selectedRarity: CardRarity;
  onSelect: (rarity: CardRarity) => void;
}

const RARITY_COLORS: Record<CardRarity, string> = {
  [CardRarity.COMMON]: 'from-slate-400 to-slate-500',
  [CardRarity.UNCOMMON]: 'from-green-400 to-green-600',
  [CardRarity.RARE]: 'from-blue-400 to-blue-600',
  [CardRarity.EPIC]: 'from-purple-400 to-purple-600',
  [CardRarity.LEGENDARY]: 'from-yellow-400 via-orange-400 to-yellow-500',
};

export const CardRaritySelector: React.FC<CardRaritySelectorProps> = ({
  selectedRarity,
  onSelect,
}) => {
  const rarities = Object.values(CardRarity);

  return (
    <div className="flex flex-wrap gap-2">
      {rarities.map((rarity) => {
        const config = RARITY_CONFIGS[rarity];
        const isSelected = selectedRarity === rarity;
        const gradientColors = RARITY_COLORS[rarity];

        return (
          <motion.button
            key={rarity}
            onClick={() => onSelect(rarity)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`
              relative px-4 py-2 rounded-lg font-medium text-sm transition-all
              ${isSelected 
                ? `bg-gradient-to-r ${gradientColors} text-white shadow-md ${config.glowColor ? `shadow-lg ${config.glowColor}` : ''}` 
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-600/50'
              }
            `}
          >
            {/* Shimmer effect for rare+ selected */}
            {isSelected && config.hasShimmer && (
              <motion.div
                className="absolute inset-0 rounded-lg overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{
                    x: ['-100%', '200%'],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              </motion.div>
            )}
            
            <span className="relative z-10 flex items-center gap-1.5">
              {/* Rarity indicator dot */}
              <span 
                className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : `bg-gradient-to-r ${gradientColors}`}`}
              />
              {config.name}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};

export default CardRaritySelector;
