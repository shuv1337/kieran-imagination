import React from 'react';
import { motion } from 'framer-motion';
import { Download, Share2, RefreshCw, ArrowLeft, Palette } from 'lucide-react';
import { CardTheme, CardRarity } from '../../types';
import { CardFrame } from './CardFrame';

interface TradingCardPreviewProps {
  imageUrl: string;
  cardName: string;
  theme: CardTheme;
  rarity: CardRarity;
  onBack: () => void;
  onRegenerate?: () => void;
  onChangeRarity?: () => void;
  onDownload?: () => void;
  isRegenerating?: boolean;
}

export const TradingCardPreview: React.FC<TradingCardPreviewProps> = ({
  imageUrl,
  cardName,
  theme,
  rarity,
  onBack,
  onRegenerate,
  onChangeRarity,
  onDownload,
  isRegenerating = false,
}) => {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${cardName} - Trading Card`,
          text: `Check out my custom trading card: ${cardName}!`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share cancelled or failed');
      }
    } else {
      // Fallback: copy URL to clipboard
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4 md:p-8 max-w-4xl mx-auto w-full">
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="self-start flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Create Another
      </motion.button>

      {/* Card preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        className="w-full max-w-xs"
      >
        <CardFrame
          imageUrl={imageUrl}
          cardName={cardName}
          theme={theme}
          rarity={rarity}
        />
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-3 justify-center"
      >
        {onDownload && (
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-medium transition-all transform hover:scale-105"
          >
            <Download className="w-5 h-5" />
            Download
          </button>
        )}

        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium transition-all transform hover:scale-105"
        >
          <Share2 className="w-5 h-5" />
          Share
        </button>

        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium transition-all transform hover:scale-105 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`} />
            Regenerate Art
          </button>
        )}

        {onChangeRarity && (
          <button
            onClick={onChangeRarity}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-all transform hover:scale-105"
          >
            <Palette className="w-5 h-5" />
            Change Rarity
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default TradingCardPreview;
