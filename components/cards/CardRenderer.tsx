import React, { forwardRef } from 'react';
import type { CardDocumentV1, CardRarity, CardTheme } from '../../shared/cards';
import { CARD_DESIGN_HEIGHT, CARD_DESIGN_WIDTH } from '../../shared/cards';

const RARITY_STYLES: Record<
  CardRarity,
  { border: string; glow: string; badge: string }
> = {
  common: { border: '#94a3b8', glow: 'transparent', badge: 'Common' },
  uncommon: { border: '#22c55e', glow: 'rgba(34,197,94,0.35)', badge: 'Uncommon' },
  rare: { border: '#3b82f6', glow: 'rgba(59,130,246,0.4)', badge: 'Rare' },
  epic: { border: '#a855f7', glow: 'rgba(168,85,247,0.5)', badge: 'Epic' },
  legendary: { border: '#facc15', glow: 'rgba(250,204,21,0.55)', badge: 'Legendary' },
};

const THEME_BG: Record<CardTheme, string> = {
  creature: 'linear-gradient(160deg, #1e293b 0%, #0f172a 50%, #422006 100%)',
  custom: 'linear-gradient(160deg, #312e81 0%, #1e1b4b 50%, #4c1d95 100%)',
};

export interface CardRendererProps {
  document: CardDocumentV1;
  artUrl?: string | null;
  /** CSS scale for on-screen preview (design units stay 500×700). */
  scale?: number;
  className?: string;
}

/**
 * Single card renderer used by preview, PNG export, print, and share.
 * Fixed 500×700 design units.
 */
export const CardRenderer = forwardRef<HTMLDivElement, CardRendererProps>(
  function CardRenderer({ document: doc, artUrl, scale = 1, className }, ref) {
    const rarity = RARITY_STYLES[doc.presentation.rarity] || RARITY_STYLES.common;
    const { focalX, focalY, zoom } = doc.artworkPlacement;

    return (
      <div
        className={className}
        style={{
          width: CARD_DESIGN_WIDTH * scale,
          height: CARD_DESIGN_HEIGHT * scale,
        }}
      >
        <div
          ref={ref}
          data-card-renderer="1"
          style={{
            width: CARD_DESIGN_WIDTH,
            height: CARD_DESIGN_HEIGHT,
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
            background: THEME_BG[doc.presentation.theme] || THEME_BG.custom,
            borderRadius: 24,
            border: `6px solid ${rarity.border}`,
            boxShadow: `0 0 24px ${rarity.glow}, 0 12px 40px rgba(0,0,0,0.45)`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'system-ui, sans-serif',
            color: '#f8fafc',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px 8px',
              background: 'rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>{doc.name}</div>
            {doc.hp != null && (
              <div
                style={{
                  background: '#ef4444',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                HP {doc.hp}
              </div>
            )}
          </div>

          {doc.typeLabel && (
            <div style={{ padding: '0 16px 6px', fontSize: 12, opacity: 0.8 }}>{doc.typeLabel}</div>
          )}

          {/* Art window */}
          <div
            style={{
              margin: '0 14px',
              height: 280,
              borderRadius: 12,
              overflow: 'hidden',
              border: '3px solid rgba(255,255,255,0.15)',
              background: '#0f172a',
              position: 'relative',
            }}
          >
            {artUrl ? (
              <img
                src={artUrl}
                alt=""
                crossOrigin="anonymous"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: `${focalX * 100}% ${focalY * 100}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: `${focalX * 100}% ${focalY * 100}%`,
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  fontSize: 14,
                }}
              >
                No art yet
              </div>
            )}
          </div>

          {/* Moves */}
          <div style={{ flex: 1, padding: '12px 16px', overflow: 'hidden' }}>
            {doc.moves.map((m) => (
              <div
                key={m.id}
                style={{
                  marginBottom: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                  <span>{m.name}</span>
                  {m.power != null && <span>{m.power}</span>}
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{m.description}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '8px 16px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              background: 'rgba(0,0,0,0.25)',
              fontSize: 11,
            }}
          >
            <div style={{ flex: 1, fontStyle: 'italic', opacity: 0.85, paddingRight: 8 }}>
              {doc.flavorText}
            </div>
            <div
              style={{
                border: `1px solid ${rarity.border}`,
                borderRadius: 6,
                padding: '2px 8px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {rarity.badge}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export async function exportCardPng(
  node: HTMLElement,
  scale = 3
): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default;
  // Wait for fonts + images
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
    )
  );

  const canvas = await html2canvas(node, {
    scale,
    useCORS: true,
    backgroundColor: null,
    width: CARD_DESIGN_WIDTH,
    height: CARD_DESIGN_HEIGHT,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG export failed'));
      },
      'image/png'
    );
  });
}
