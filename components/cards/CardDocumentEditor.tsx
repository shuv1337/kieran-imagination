import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  getCard,
  patchCard,
  regenerateCardArt,
  requestCardCopySuggestions,
} from '../../services/cards';
import { assetUrl, pollJob } from '../../services/jobs';
import type { CardDocument, CardDocumentV1, CardRarity, CardTheme } from '../../shared/cards';
import { defaultCardDocument } from '../../shared/cards';
import { CardRenderer, exportCardPng } from './CardRenderer';
import Background from '../Background';
import { ErrorModal } from '../ErrorModal';

export const CardDocumentEditor: React.FC = () => {
  const { worldId, cardId } = useParams<{ worldId: string; cardId: string }>();
  const renderRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const [card, setCard] = useState<CardDocument | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [doc, setDoc] = useState<CardDocumentV1>(defaultCardDocument());
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [artworkRevisionId, setArtworkRevisionId] = useState<string | null>(null);
  const [artPrompt, setArtPrompt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    if (!cardId) return;
    const res = await getCard(cardId);
    setCard(res.card);
    if (res.revision) {
      setRevisionId(res.revision.id);
      setDoc(res.revision.document);
      setArtworkRevisionId(res.revision.artworkRevisionId);
    } else {
      setRevisionId(null);
      setArtworkRevisionId(null);
    }
    // Always reset art (avoid stale art when navigating between cards)
    if (res.artUrl) {
      setArtUrl(res.artUrl);
    } else if (res.artAssetId) {
      setArtUrl(assetUrl(res.artAssetId));
    } else {
      setArtUrl(null);
    }
  };

  useEffect(() => {
    void load().catch((e) => setErrorMessage(e instanceof Error ? e.message : 'Load failed'));
  }, [cardId]);

  const saveDoc = async () => {
    if (!cardId || !revisionId) return;
    setBusy('save');
    try {
      const res = await patchCard(cardId, revisionId, doc, artworkRevisionId);
      setCard(res.card);
      setRevisionId(res.revision.id);
      setDoc(res.revision.document);
      setDirty(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const update = <K extends keyof CardDocumentV1>(key: K, value: CardDocumentV1[K]) => {
    setDoc((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const regenerateArt = async () => {
    if (!cardId || !revisionId) return;
    setBusy('art');
    try {
      if (dirty) {
        const saved = await patchCard(cardId, revisionId, doc, artworkRevisionId);
        setRevisionId(saved.revision.id);
        setDirty(false);
      }
      const { jobId } = await regenerateCardArt(cardId, artPrompt.trim() || doc.name);
      const job = await pollJob(jobId, { onUpdate: (j) => setBusy(`art · ${j.stage}`) });
      if (job.status !== 'succeeded') {
        throw new Error(job.errorMessage || 'Art generation failed');
      }
      await load();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Art failed');
    } finally {
      setBusy(null);
    }
  };

  const suggestCopy = async () => {
    if (!cardId) return;
    setBusy('copy');
    try {
      const { jobId } = await requestCardCopySuggestions(
        cardId,
        `${doc.name}: ${artPrompt || doc.flavorText || 'fun creature'}`
      );
      const job = await pollJob(jobId);
      if (job.status !== 'succeeded') {
        throw new Error(job.errorMessage || 'Suggestions failed');
      }
      const result = job.resultJson as {
        moves?: CardDocumentV1['moves'];
        flavorText?: string;
      } | null;
      if (result?.moves?.length) {
        update(
          'moves',
          result.moves.map((m) => ({
            id: m.id || crypto.randomUUID(),
            name: m.name,
            description: m.description,
            power: m.power,
            cost: m.cost,
          }))
        );
      }
      if (result?.flavorText) {
        update('flavorText', result.flavorText);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Copy suggestions failed');
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    const node = exportRef.current || renderRef.current;
    if (!node) return;
    setBusy('export');
    try {
      const blob = await exportCardPng(node, 3);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name || 'card'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => {
    const node = exportRef.current || renderRef.current;
    if (!node) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<html><head><title>${doc.name}</title></head><body style="margin:0;display:flex;justify-content:center;">${node.outerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const handleShare = async () => {
    try {
      const node = exportRef.current || renderRef.current;
      if (!node) return;
      const blob = await exportCardPng(node, 3);
      const file = new File([blob], `${doc.name || 'card'}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.name });
      } else if (navigator.share) {
        await navigator.share({ title: doc.name, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied!');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setErrorMessage(e instanceof Error ? e.message : 'Share failed');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative text-slate-100">
      <Background />
      <header className="relative z-10 p-4 flex items-center gap-3">
        <Link to={`/worlds/${worldId}`} className="text-slate-400 hover:text-white">
          <ChevronLeft size={28} />
        </Link>
        <h1 className="text-xl font-comic flex-1">{card?.title || 'Card'}</h1>
        {busy && (
          <span className="text-sm text-amber-300 flex items-center gap-1">
            <Loader2 className="animate-spin" size={14} /> {busy}
          </span>
        )}
      </header>

      <main className="relative z-10 flex-1 grid lg:grid-cols-2 gap-8 px-4 pb-12 max-w-6xl mx-auto w-full">
        <div className="flex justify-center relative">
          <CardRenderer ref={renderRef} document={doc} artUrl={artUrl} scale={0.85} />
          {/* Off-screen unscaled node for crisp 1500×2100 export */}
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: -10000,
              top: 0,
              pointerEvents: 'none',
            }}
          >
            <CardRenderer ref={exportRef} document={doc} artUrl={artUrl} scale={1} />
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-sm text-slate-400">Name</label>
          <input
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-600"
            value={doc.name}
            onChange={(e) => update('name', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400">HP</label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-600"
                value={doc.hp ?? ''}
                onChange={(e) => update('hp', e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400">Type</label>
              <input
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-600"
                value={doc.typeLabel ?? ''}
                onChange={(e) => update('typeLabel', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {(['creature', 'custom'] as CardTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  update('presentation', { ...doc.presentation, theme: t })
                }
                className={`px-3 py-1 rounded-full text-sm border ${
                  doc.presentation.theme === t ? 'bg-purple-600 border-purple-400' : 'border-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {(['common', 'uncommon', 'rare', 'epic', 'legendary'] as CardRarity[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() =>
                  update('presentation', { ...doc.presentation, rarity: r })
                }
                className={`px-3 py-1 rounded-full text-sm border ${
                  doc.presentation.rarity === r ? 'bg-yellow-600 border-yellow-400' : 'border-slate-600'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <label className="block text-sm text-slate-400">Flavor text</label>
          <textarea
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-600"
            rows={2}
            value={doc.flavorText ?? ''}
            onChange={(e) => update('flavorText', e.target.value)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Moves</span>
              <button
                type="button"
                onClick={() => void suggestCopy()}
                className="text-xs flex items-center gap-1 text-cyan-300"
              >
                <Sparkles size={12} /> New attacks
              </button>
            </div>
            {doc.moves.map((m, idx) => (
              <div key={m.id} className="p-2 rounded-lg bg-slate-900 border border-slate-700 space-y-1">
                <input
                  className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm"
                  value={m.name}
                  onChange={(e) => {
                    const moves = [...doc.moves];
                    moves[idx] = { ...m, name: e.target.value };
                    update('moves', moves);
                  }}
                />
                <input
                  className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm"
                  value={m.description}
                  onChange={(e) => {
                    const moves = [...doc.moves];
                    moves[idx] = { ...m, description: e.target.value };
                    update('moves', moves);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400">Focal X</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={doc.artworkPlacement.focalX}
                onChange={(e) =>
                  update('artworkPlacement', {
                    ...doc.artworkPlacement,
                    focalX: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Focal Y</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={doc.artworkPlacement.focalY}
                onChange={(e) =>
                  update('artworkPlacement', {
                    ...doc.artworkPlacement,
                    focalY: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Zoom</label>
              <input
                type="range"
                min={0.8}
                max={2}
                step={0.05}
                value={doc.artworkPlacement.zoom}
                onChange={(e) =>
                  update('artworkPlacement', {
                    ...doc.artworkPlacement,
                    zoom: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>

          <label className="block text-sm text-slate-400">Art prompt</label>
          <input
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-600"
            value={artPrompt}
            onChange={(e) => setArtPrompt(e.target.value)}
            placeholder="Friendly dragon knight…"
          />

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void saveDoc()}
              className="px-4 py-2 rounded-xl bg-slate-700 font-bold"
            >
              Save fields
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void regenerateArt()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700 font-bold"
            >
              <RefreshCw size={16} /> Regenerate art
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void handleExport()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-700 font-bold"
            >
              <Download size={16} /> Export PNG
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-700 font-bold"
            >
              Print
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void handleShare()}
              className="px-4 py-2 rounded-xl bg-cyan-700 font-bold"
            >
              Share
            </button>
          </div>
        </div>
      </main>

      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
    </div>
  );
};
