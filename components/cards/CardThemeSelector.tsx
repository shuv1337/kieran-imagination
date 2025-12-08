import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Star } from 'lucide-react';
import { CardTheme } from '../../types';
import { THEME_CONFIGS } from './cardConfigs';

interface CardThemeSelectorProps {
  selectedTheme: CardTheme;
  onSelect: (theme: CardTheme) => void;
}

const THEME_ICONS: Record<CardTheme, React.ReactNode> = {
  [CardTheme.POKEMON]: <Zap className="w-5 h-5" />,
  [CardTheme.CUSTOM]: <Star className="w-5 h-5" />,
};

export const CardThemeSelector: React.FC<CardThemeSelectorProps> = ({
  selectedTheme,
  onSelect,
}) => {
  const themes = Object.values(CardTheme);

  return (
    <div className="flex flex-wrap gap-3">
      {themes.map((theme) => {
        const config = THEME_CONFIGS[theme];
        const isSelected = selectedTheme === theme;

        return (
          <motion.button
            key={theme}
            onClick={() => onSelect(theme)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`
              relative flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all
              ${isSelected 
                ? `bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} text-white shadow-lg` 
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/50'
              }
            `}
          >
            {isSelected && (
              <motion.div
                layoutId="theme-indicator"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/20 to-transparent"
                initial={false}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{THEME_ICONS[theme]}</span>
            <span className="relative z-10">{config.name}</span>
          </motion.button>
        );
      })}
    </div>
  );
};

export default CardThemeSelector;
