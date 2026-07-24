import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Paintbrush,
  Sparkles,
  RefreshCw,
  Loader2,
  Download,
  Shuffle,
  Pin,
  History,
  Printer,
  Share2,
  ZoomIn,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  createCharacter,
  getArtwork,
  listCharacters,
  pinCharacter,
  saveEditorRevision,
} from '../../services/worlds';
import { assetUrl, listJobs, runCreationJob } from '../../services/jobs';
import type { Artwork, ArtworkRevision, WorldCharacter } from '../../shared/worlds';
import type { JobStatusResponse } from '../../shared/jobs';
import Background from '../Background';
import { ErrorModal } from '../ErrorModal';
import { Editor } from '../Editor';

const FIX_COLORING =
  'This image has coloring or shading that should not be there. Convert it into a proper black-and-white coloring page with ONLY pure black outlines on a pure white background. Remove ALL colors, shading, gradients, and filled-in areas. Every shape should be an empty outline ready to be colored in by a child.';

const REMIX_INSTRUCTION =
  'Remix this coloring page with a fun variation while keeping the same main subject and clean black-and-white line art outlines on white.';

export const ArtworkView: React.FC = () => {
  const { worldId, artworkId } = useParams<{ worldId: string; artworkId: string }>();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [revisions, setRevisions] = useState<ArtworkRevision[]>([]);
  const [viewRevisionId, setViewRevisionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeJobs, setActiveJobs] = useState<JobStatusResponse[]>([]);
  const [characters, setCharacters] = useState<WorldCharacter[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const resolvedWorldId = worldId || artwork?.worldId;

  const load = async (preferRevisionId?: string | null) => {
    if (!artworkId) return;
    const res = await getArtwork(artworkId);
    setArtwork(res.artwork);
    setRevisions(res.revisions);
    if (preferRevisionId) {
      setViewRevisionId(preferRevisionId);
    } else if (res.artwork.currentRevisionId) {
      // Always track head when not explicitly preferring a historical view
      setViewRevisionId((prev) => prev ?? res.artwork.currentRevisionId);
    }
  };

  const refreshJobs = async () => {
    if (!resolvedWorldId) return;
    const res = await listJobs({ worldId: resolvedWorldId, active: true });
    const mine = res.jobs.filter((j) => j.artworkId === artworkId);
    setActiveJobs(mine.filter((j) => j.status === 'queued' || j.status === 'running'));
    // On successful terminal job, advance view to the new revision
    const succeeded = mine.filter((j) => j.status === 'succeeded');
    if (succeeded.length > 0) {
      const latest = succeeded.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
      await load(latest.resultRevisionId || null);
    }
  };

  useEffect(() => {
    void load().catch((e) => setErrorMessage(e instanceof Error ? e.message : 'Load failed'));
    void refreshJobs().catch(() => undefined);
    if (resolvedWorldId) {
      void listCharacters(resolvedWorldId)
        .then((r) => setCharacters(r.characters))
        .catch(() => undefined);
    }
  }, [artworkId, resolvedWorldId]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const t = setInterval(() => {
      void refreshJobs();
    }, 2000);
    return () => clearInterval(t);
  }, [activeJobs.length, artworkId, resolvedWorldId]);

  const current =
    revisions.find((r) => r.id === viewRevisionId) ||
    revisions.find((r) => r.id === artwork?.currentRevisionId) ||
    revisions[0];
  const imageUrl = current ? assetUrl(current.mediaAssetId) : null;

  const runChildJob = async (
    operation: 'coloring.edit' | 'coloring.enhance',
    opts: {
      instruction?: string;
      quality?: 'draft' | 'standard' | 'print' | 'premium';
      label?: string;
      parent?: ArtworkRevision;
    } = {}
  ) => {
    const parent = opts.parent || current;
    if (!resolvedWorldId || !artworkId || !parent) return;
    setBusy(opts.label || operation);
    try {
      const job = await runCreationJob({
        operation,
        quality: opts.quality || 'standard',
        instruction: opts.instruction,
        inputs: [{ assetId: parent.mediaAssetId, role: 'base', position: 0 }],
        worldId: resolvedWorldId,
        artworkId,
        parentRevisionId: parent.id,
      });
      if (job.status !== 'succeeded') {
        throw new Error(job.errorMessage || 'Job failed');
      }
      await load();
      if (job.resultRevisionId) setViewRevisionId(job.resultRevisionId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Job failed');
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (rev: ArtworkRevision) => {
    if (!artworkId) return;
    setBusy('restore');
    try {
      // Child revision reusing media; parent is current head for branch lineage
      const res = await saveEditorRevision(
        artworkId,
        rev.mediaAssetId,
        artwork?.currentRevisionId ?? null
      );
      setViewRevisionId(res.revision.id);
      await load();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(null);
    }
  };

  const handlePinCharacter = async () => {
    if (!resolvedWorldId || !current) return;
    setBusy('pin');
    try {
      const name = window.prompt('Name this character reference', 'Hero') || 'Hero';
      if (characters[0]) {
        await pinCharacter(resolvedWorldId, characters[0].id, current.id);
      } else {
        await createCharacter(resolvedWorldId, name, current.id);
      }
      const list = await listCharacters(resolvedWorldId);
      setCharacters(list.characters);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Pin failed');
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${artwork?.title || 'kierans-art'}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch {
      window.open(imageUrl, '_blank');
    }
  };

  const handleShare = async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `${artwork?.title || 'kierans-art'}.png`, {
        type: blob.type || 'image/png',
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Coloring Page',
          text: "Check out this coloring page I made with Kieran's Imagination!",
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'My Coloring Page',
          text: "Check out this coloring page I made with Kieran's Imagination!",
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setErrorMessage('Could not share this page.');
      }
    }
  };

  const handlePrint = () => {
    if (!imageUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(
      `<html><head><title>Print Coloring Page</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh"><img src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain"></body></html>`
    );
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  if (editing && imageUrl && current) {
    return (
      <Editor
        initialImage={imageUrl}
        fileName={`${artwork?.title || 'art'}.png`}
        parentRevisionId={current.id}
        artworkId={artworkId!}
        worldId={resolvedWorldId!}
        onBack={() => {
          setEditing(false);
          void load();
        }}
        onSaved={() => {
          setEditing(false);
          void load();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative text-slate-100 overflow-hidden">
      <Background />
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
        {!imageUrl ? (
          <div className="text-slate-400 py-20 text-center">
            <p className="mb-4">
              {activeJobs.length > 0
                ? 'Generation in progress — hang tight…'
                : 'No revision yet — generate one.'}
            </p>
            {activeJobs.length === 0 && (
              <Link
                to="/"
                className="text-cyan-400 underline"
              >
                Create
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="space-y-2">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <span className="rounded-full border border-green-500/30 bg-green-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-green-400">
                    Ready to Color!
                  </span>
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-comic text-4xl text-white drop-shadow-lg md:text-6xl"
                >
                  Your Masterpiece
                </motion.h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/"
                  className="flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-3 font-bold text-slate-300 transition-colors hover:bg-slate-700"
                >
                  <ChevronLeft size={20} /> Back
                </Link>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-3 font-bold text-white shadow-lg shadow-pink-500/25"
                >
                  <Paintbrush size={20} /> Open Editor
                </motion.button>
              </div>
            </div>

            {(busy || activeJobs.length > 0) && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                <Loader2 className="animate-spin" size={16} />
                {busy || 'Working some more magic…'}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="group relative flex-[2]"
              >
                <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 opacity-30 blur-xl transition duration-700 group-hover:opacity-50" />
                <div className="relative flex h-full min-h-[400px] items-center justify-center overflow-hidden rounded-[2rem] border-4 border-white/50 bg-white p-4 shadow-2xl">
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                    }}
                  />
                  <button type="button" onClick={() => setIsFullscreen(true)} className="relative z-10">
                    <img
                      src={imageUrl}
                      alt={artwork?.title || 'Generated coloring page'}
                      className="max-h-[70vh] max-w-full object-contain drop-shadow-xl"
                    />
                  </button>
                  <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                    <ZoomIn size={14} /> Tap to view full size
                  </div>
                </div>
              </motion.div>

              <div className="flex flex-1 flex-col gap-4 lg:max-w-sm">
                <motion.section
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="order-2 flex flex-col gap-4 rounded-3xl border border-slate-700 bg-slate-800/50 p-6 backdrop-blur lg:order-1"
                >
                  <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                    <Sparkles className="text-yellow-400" /> AI Magic Tools
                  </h2>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void runChildJob('coloring.enhance', { label: 'Enhancing details…' })}
                    className="group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-slate-600 px-4 py-4 text-left transition-all hover:border-purple-400 hover:bg-slate-700/50 disabled:opacity-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300 group-hover:bg-purple-500 group-hover:text-white">
                      {busy?.startsWith('Enhancing') ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    </span>
                    <span>
                      <strong className="block text-slate-200">Enhance Details</strong>
                      <span className="text-xs text-slate-400">Sharpen lines &amp; add patterns</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      void runChildJob('coloring.edit', {
                        instruction: FIX_COLORING,
                        label: 'Fixing coloring…',
                      })
                    }
                    className="group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-slate-600 px-4 py-4 text-left transition-all hover:border-orange-400 hover:bg-slate-700/50 disabled:opacity-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300 group-hover:bg-orange-500 group-hover:text-white">
                      {busy?.startsWith('Fixing') ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                    </span>
                    <span>
                      <strong className="block text-slate-200">Fix Coloring</strong>
                      <span className="text-xs text-slate-400">Remove pre-colored areas</span>
                    </span>
                  </button>
                </motion.section>

                <motion.section
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="order-1 flex flex-col gap-3 rounded-3xl border border-slate-700 bg-slate-800/50 p-6 backdrop-blur lg:order-2"
                >
                  <h2 className="text-xl font-bold text-white">Share &amp; Save</h2>
                  <button
                    type="button"
                    onClick={() => void handleShare()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 font-bold text-white shadow-lg shadow-green-600/20"
                  >
                    <Share2 size={20} /> Share Image
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500"
                  >
                    <Download size={20} /> Download Image
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-3 font-bold text-white hover:bg-slate-600"
                  >
                    <Printer size={20} /> Print Now
                  </button>
                </motion.section>
              </div>
            </div>

            {revisions.length > 0 && (
              <details className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                <summary className="flex cursor-pointer items-center gap-2 font-bold">
                  <History size={16} /> Creation History
                </summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {revisions.map((revision) => (
                    <li
                      key={revision.id}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
                        revision.id === current?.id
                          ? 'border-cyan-500 bg-slate-800'
                          : 'border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => setViewRevisionId(revision.id)}
                      >
                        {new Date(revision.createdAt).toLocaleString()}
                      </button>
                      {revision.id !== artwork?.currentRevisionId && (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void handleRestore(revision)}
                          className="rounded bg-cyan-800 px-2 py-1 text-xs"
                        >
                          Restore
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      void runChildJob('coloring.edit', {
                        instruction: REMIX_INSTRUCTION,
                        label: 'Remixing…',
                      })
                    }
                    className="flex items-center gap-2 rounded-lg bg-pink-700 px-3 py-2 text-sm"
                  >
                    <Shuffle size={15} /> Remix
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void handlePinCharacter()}
                    className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm"
                  >
                    <Pin size={15} /> Pin character
                  </button>
                  {characters.length > 0 && (
                    <span className="self-center text-xs text-slate-400">
                      {characters.map((character) => character.name).join(', ')}
                    </span>
                  )}
                </div>
              </details>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {isFullscreen && imageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
            onClick={() => setIsFullscreen(false)}
          >
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              aria-label="Close full size image"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-3 text-white"
            >
              <X size={24} />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={imageUrl}
              alt={artwork?.title || 'Generated coloring page full size'}
              className="max-h-full max-w-full object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
    </div>
  );
};
