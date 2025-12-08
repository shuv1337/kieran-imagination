import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CardTemplate } from './cardTemplates';
import { RARITY_CONFIGS } from './cardConfigs';

interface CardTemplateCarouselProps {
  templates: CardTemplate[];
  onSelect: (template: CardTemplate) => void;
}

const RARITY_COLORS: Record<string, string> = {
  common: 'from-slate-500 to-slate-600',
  uncommon: 'from-green-500 to-green-600',
  rare: 'from-blue-500 to-blue-600',
  epic: 'from-purple-500 to-purple-600',
  legendary: 'from-yellow-400 via-orange-500 to-yellow-500',
};

export const CardTemplateCarousel: React.FC<CardTemplateCarouselProps> = ({
  templates,
  onSelect,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="relative group">
      {/* Left scroll button */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-800/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-700"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1 -mx-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {templates.map((template, index) => {
          const rarityConfig = RARITY_CONFIGS[template.suggestedRarity];
          const gradientColors = RARITY_COLORS[template.suggestedRarity] || RARITY_COLORS.common;

          return (
            <motion.button
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelect(template)}
              whileHover={{ scale: 1.05, y: -4 }}
              whileTap={{ scale: 0.95 }}
              className="flex-shrink-0 w-32 p-3 rounded-xl bg-slate-800/50 border border-slate-600/50 hover:border-slate-500/50 transition-all flex flex-col items-center gap-2 group/card"
            >
              {/* Emoji preview */}
              <div className="text-4xl">{template.previewEmoji}</div>
              
              {/* Template name */}
              <span className="text-sm font-medium text-white text-center line-clamp-1">
                {template.name}
              </span>
              
              {/* Rarity badge */}
              <span 
                className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${gradientColors} text-white font-medium`}
              >
                {rarityConfig.name}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Right scroll button */}
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-800/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-700"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900/80 to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900/80 to-transparent pointer-events-none" />
    </div>
  );
};

export default CardTemplateCarousel;
