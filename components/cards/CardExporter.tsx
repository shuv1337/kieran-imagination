import React, { useRef, useCallback } from 'react';
import { CardTheme, CardRarity } from '../../types';
import { CardFrame } from './CardFrame';

interface CardExporterProps {
  imageUrl: string;
  cardName: string;
  theme: CardTheme;
  rarity: CardRarity;
  onExport?: (dataUrl: string) => void;
  children?: (exportFn: () => Promise<string | null>) => React.ReactNode;
}

export const CardExporter: React.FC<CardExporterProps> = ({
  imageUrl,
  cardName,
  theme,
  rarity,
  onExport,
  children,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const exportCard = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;

    try {
      // Dynamic import html2canvas to reduce initial bundle size
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2, // Higher quality export
        useCORS: true,
        allowTaint: true,
      });

      const dataUrl = canvas.toDataURL('image/png');
      
      if (onExport) {
        onExport(dataUrl);
      }

      return dataUrl;
    } catch (error) {
      console.error('Failed to export card:', error);
      return null;
    }
  }, [onExport]);

  const downloadCard = useCallback(async () => {
    const dataUrl = await exportCard();
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.download = `${cardName.replace(/\s+/g, '-').toLowerCase()}-card.png`;
    link.href = dataUrl;
    link.click();
  }, [exportCard, cardName]);

  return (
    <div className="relative">
      {/* Hidden card for export - positioned off-screen but rendered */}
      <div 
        ref={cardRef}
        className="fixed -left-[9999px] -top-[9999px] w-[350px]"
        aria-hidden="true"
      >
        <CardFrame
          imageUrl={imageUrl}
          cardName={cardName}
          theme={theme}
          rarity={rarity}
        />
      </div>

      {/* Render children with export function */}
      {children ? children(exportCard) : (
        <button
          onClick={downloadCard}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
        >
          Export Card
        </button>
      )}
    </div>
  );
};

export default CardExporter;
