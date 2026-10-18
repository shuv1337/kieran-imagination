import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LogIn,
  LogOut,
  Sparkles,
  Upload,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import Background from './Background';
import { ErrorModal } from './ErrorModal';
import kieranLogo from '../kieran-logo.png';
import { fetchPublicSuggestions, improvePromptViaJob } from '../services/textHelpers';
import { runCreationJob, uploadFile } from '../services/jobs';
import {
  createArtwork,
  getOrCreateCreationWorld,
  listCharacters,
} from '../services/worlds';
import { getSession, logout } from '../services/api';

const FALLBACK_SUGGESTIONS = [
  '🦖 A T-Rex playing guitar',
  '🏰 A castle in the clouds',
  '🚀 A hamster astronaut',
  '🧙 A wizard cat',
  '🦄 A rainbow unicorn',
];

function friendlyStage(status: string, stage: string): string {
  if (status === 'queued') return 'Getting the crayons ready…';
  if (stage === 'input') return 'Looking at your idea…';
  if (stage === 'model') return 'Drawing your coloring page…';
  if (stage === 'normalize') return 'Cleaning up the lines…';
  if (stage === 'save') return 'Saving your masterpiece…';
  return 'Making something wonderful…';
}

export const CreatorHome: React.FC = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createAreaRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState(FALLBACK_SUGGESTIONS);
  const [uploadedAssetId, setUploadedAssetId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [stage, setStage] = useState('');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchPublicSuggestions()
      .then((items) => {
        if (items.length > 0) setSuggestions(items);
      })
      .catch(() => undefined);
    void getSession()
      .then((session) => setAuthenticated(session.authenticated))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith('image/')
      );
      const file = image?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void handleFile(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(
    () => () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    },
    [uploadPreview]
  );

  useEffect(() => {
    if (!generating) {
      setElapsedTime(0);
      return;
    }
    const timer = window.setInterval(() => setElapsedTime((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    const timer = window.setInterval(
      () => setCarouselIndex((value) => (value + 1) % suggestions.length),
      3000
    );
    return () => window.clearInterval(timer);
  }, [suggestions.length]);

  const handleFile = async (file: File) => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(URL.createObjectURL(file));
    setUploadedAssetId(null);
    setUploading(true);
    try {
      const result = await uploadFile(file, file.name);
      setUploadedAssetId(result.assetId);
    } catch (error) {
      setUploadPreview(null);
      setErrorMessage(error instanceof Error ? error.message : 'Could not add that photo.');
    } finally {
      setUploading(false);
    }
  };

  const clearUpload = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(null);
    setUploadedAssetId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImprove = async () => {
    if (!prompt.trim() || improving) return;
    setImproving(true);
    try {
      setPrompt(await improvePromptViaJob(prompt.trim()));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not improve that idea.');
    } finally {
      setImproving(false);
    }
  };

  const handleGenerate = async () => {
    if ((!prompt.trim() && !uploadedAssetId) || generating || uploading) return;
    setGenerating(true);
    setStage('Getting the crayons ready…');
    try {
      const world = await getOrCreateCreationWorld();
      const effectivePrompt =
        prompt.trim() ||
        'Turn this photo into a clean black-and-white coloring page with bold outlines.';
      const { artwork } = await createArtwork(
        world.id,
        'coloring',
        effectivePrompt.slice(0, 60)
      );
      const inputs: Array<{
        assetId: string;
        role: 'base' | 'character';
        position: number;
      }> = uploadedAssetId
        ? [{ assetId: uploadedAssetId, role: 'base', position: 0 }]
        : [];

      try {
        const { characters } = await listCharacters(world.id);
        const pinned = characters.find((character) => character.pinnedMediaAssetId);
        if (pinned?.pinnedMediaAssetId) {
          inputs.push({
            assetId: pinned.pinnedMediaAssetId,
            role: 'character',
            position: inputs.length,
          });
        }
      } catch {
        // Character continuity is optional and should never block creation.
      }

      const job = await runCreationJob(
        {
          operation: 'coloring.generate',
          quality: 'standard',
          prompt: effectivePrompt,
          inputs,
          worldId: world.id,
          artworkId: artwork.id,
        },
        {
          onUpdate: (next) => setStage(friendlyStage(next.status, next.stage)),
        }
      );

      if (job.status !== 'succeeded') {
        throw new Error(job.errorMessage || 'The drawing did not finish.');
      }
      navigate('/artworks/' + artwork.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not make that page.');
    } finally {
      setGenerating(false);
      setStage('');
    }
  };

  const chooseSuggestion = (suggestion: string) => {
    setPrompt(suggestion.replace(/^[^\p{L}\p{N}]+\s*/u, ''));
  };

  const lucky = () => {
    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    if (suggestion) chooseSuggestion(suggestion);
  };

  const canGenerate = (!!prompt.trim() || !!uploadedAssetId) && !uploading && !generating;
  const nextSuggestion = () =>
    setCarouselIndex((value) => (value + 1) % Math.max(suggestions.length, 1));
  const previousSuggestion = () =>
    setCarouselIndex(
      (value) => (value - 1 + Math.max(suggestions.length, 1)) % Math.max(suggestions.length, 1)
    );

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-100 relative overflow-hidden pb-16 md:pb-0">
      <Background />

      <div className="absolute right-3 top-3 z-20 md:right-6 md:top-6">
        {authenticated ? (
          <button
            type="button"
            aria-label="Stop family syncing"
            onClick={async () => {
              await logout();
              setAuthenticated(false);
            }}
            className="flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-2 text-xs text-slate-300 backdrop-blur hover:text-white"
          >
            <LogOut size={15} /> <span className="hidden sm:inline">Stop syncing</span>
          </button>
        ) : (
          <Link
            to="/login?next=/"
            aria-label="Family sync"
            className="flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-2 text-xs text-slate-300 backdrop-blur hover:text-white"
          >
            <LogIn size={15} /> <span className="hidden sm:inline">Family sync</span>
          </Link>
        )}
      </div>

      <header className="relative z-10 flex flex-col items-center justify-center gap-6 p-6 md:flex-row md:gap-8 md:p-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={reduceMotion ? undefined : { scale: 1.1, rotate: 5 }}
          className="relative group"
        >
          <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 opacity-60 blur-lg group-hover:opacity-100" />
          <img
            src={kieranLogo}
            alt="Kieran's Imagination Logo"
            className="relative z-10 h-36 w-36 object-contain drop-shadow-2xl md:h-44 md:w-44"
          />
        </motion.div>
        <div className="relative flex flex-col items-center md:items-start">
          <motion.span
            initial={reduceMotion ? false : { x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="-rotate-2 bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text font-comic text-5xl text-transparent drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] md:text-7xl"
          >
            Kieran&apos;s
          </motion.span>
          <motion.span
            initial={reduceMotion ? false : { x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="-mt-2 rotate-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text font-comic text-6xl text-transparent drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] md:-mt-4 md:text-8xl"
          >
            Imagination
          </motion.span>
          <motion.div
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute -right-8 -top-8 text-4xl text-yellow-400"
          >
            ✨
          </motion.div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
        <motion.section
          initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative space-y-4 text-center"
        >
          <h1 className="font-comic text-4xl text-white drop-shadow-[0_5px_0_rgba(0,0,0,0.5)] md:text-8xl">
            Dream it.{' '}
            <span className="bg-gradient-to-r from-yellow-300 to-pink-500 bg-clip-text text-transparent">
              Color it.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg font-medium text-blue-200 md:text-2xl">
            Type any idea below and watch AI turn it into a coloring page!
          </p>
          <motion.button
            type="button"
            onClick={() => createAreaRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })}
            whileTap={{ scale: 0.95 }}
            className="mx-auto mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500 px-8 py-4 font-comic text-xl font-bold text-white shadow-lg shadow-orange-500/40 md:hidden"
          >
            <Sparkles size={24} /> Start Creating! <ArrowRight size={24} />
          </motion.button>
        </motion.section>

        <motion.div
          ref={createAreaRef}
          initial={reduceMotion ? false : { opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative scroll-mt-4 rounded-[2.5rem] border border-white/10 bg-slate-900/60 p-6 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl md:p-8"
        >
          <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 animate-pulse rounded-full bg-purple-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 animate-pulse rounded-full bg-blue-500/30 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6">
            <div className="group relative">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-20 blur transition duration-500 group-hover:opacity-60" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 transition-colors focus-within:border-purple-400">
                <label htmlFor="creation-prompt" className="sr-only">
                  What should the coloring page show?
                </label>
                <textarea
                  id="creation-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && canGenerate) {
                      event.preventDefault();
                      void handleGenerate();
                    }
                  }}
                  disabled={generating}
                  placeholder="I want a coloring page of..."
                  className="h-48 w-full resize-none bg-transparent p-6 font-comic text-2xl font-bold leading-tight text-white outline-none placeholder:text-slate-600 md:text-4xl"
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  <AnimatePresence>
                    {prompt.trim() && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: 20 }}
                        type="button"
                        onClick={() => void handleImprove()}
                        disabled={improving || generating}
                        className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-60 sm:gap-2 sm:px-4 sm:text-base"
                      >
                        <Zap size={18} className="text-yellow-300" />
                        {improving ? 'Improving...' : 'Improve'}
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    onClick={lucky}
                    disabled={generating}
                    whileHover={reduceMotion ? undefined : { scale: 1.1, rotate: 5 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-60 sm:gap-2 sm:px-4 sm:text-base"
                  >
                    <Sparkles size={18} className="text-yellow-300" />
                    <span className="sm:hidden">Surprise Me</span>
                    <span className="hidden sm:inline">I&apos;m Feeling Lucky!</span>
                  </motion.button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 md:hidden">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={previousSuggestion}
                aria-label="Previous suggestion"
                className="rounded-full bg-white/10 p-2 text-white/70"
              >
                <ChevronLeft size={20} />
              </motion.button>
              <div className="relative h-12 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.button
                    key={carouselIndex}
                    type="button"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    onClick={() => suggestions[carouselIndex] && chooseSuggestion(suggestions[carouselIndex])}
                    className="absolute inset-0 flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-base text-blue-200 backdrop-blur-sm"
                  >
                    {suggestions[carouselIndex]}
                  </motion.button>
                </AnimatePresence>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={nextSuggestion}
                aria-label="Next suggestion"
                className="rounded-full bg-white/10 p-2 text-white/70"
              >
                <ChevronRight size={20} />
              </motion.button>
            </div>

            <div className="hidden flex-wrap justify-center gap-3 md:flex">
              {suggestions.slice(0, 5).map((suggestion, index) => (
                <motion.button
                  key={suggestion}
                  type="button"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * index }}
                  whileHover={reduceMotion ? undefined : { scale: 1.05, y: -2 }}
                  onClick={() => chooseSuggestion(suggestion)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-blue-200 backdrop-blur-sm hover:bg-white/10"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:gap-6">
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || generating}
                  className={twMerge(
                    'flex h-28 w-full items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed transition-all md:h-24',
                    uploadPreview
                      ? 'border-green-400 bg-green-400/10'
                      : 'border-purple-400/60 bg-purple-500/10 hover:border-purple-400 hover:bg-purple-500/20 md:border-slate-600 md:bg-transparent'
                  )}
                >
                  {uploadPreview ? (
                    <>
                      <img src={uploadPreview} alt="Photo reference" className="h-20 w-20 rounded-lg object-cover shadow-md" />
                      <span className="text-left">
                        <strong className="block text-green-400">{uploading ? 'Adding Photo...' : 'Photo Added!'}</strong>
                        <span className="text-xs text-slate-400">Tap to change</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 p-3">
                        <Upload className="text-purple-300 md:text-blue-400" size={24} />
                      </span>
                      <span className="text-left">
                        <strong className="block text-lg text-white md:text-base">Upload or Paste Photo</strong>
                        <span className="text-sm text-purple-200 md:text-xs md:text-slate-500">Turn any picture into a coloring page!</span>
                      </span>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                {uploadPreview && (
                  <button
                    type="button"
                    onClick={clearUpload}
                    aria-label="Remove photo"
                    className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1.5 hover:bg-red-500/80"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              <div className="flex-[2]">
                <motion.button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={!canGenerate}
                  whileHover={canGenerate && !reduceMotion ? { scale: 1.02 } : undefined}
                  whileTap={canGenerate ? { scale: 0.98 } : undefined}
                  className={twMerge(
                    'flex h-24 w-full items-center justify-center gap-4 overflow-hidden rounded-2xl font-comic text-2xl font-bold tracking-wide shadow-xl md:text-3xl',
                    canGenerate
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white hover:shadow-indigo-500/50'
                      : 'cursor-not-allowed bg-slate-800 text-slate-600'
                  )}
                >
                  {generating ? (
                    <span className="flex flex-col items-center gap-1 px-3 text-center">
                      <span className="flex items-center gap-3 text-lg md:text-xl">
                        <Wand2 className={reduceMotion ? '' : 'animate-spin'} size={26} />
                        <span aria-live="polite">{stage}</span>
                        <span className="font-mono text-sm text-blue-200">{elapsedTime}s</span>
                      </span>
                    </span>
                  ) : (
                    <>Generate Page <ArrowRight size={32} /></>
                  )}
                </motion.button>
                {!generating && (
                  <p className="mt-2 text-center text-sm text-slate-400">
                    Your page saves automatically
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="text-center text-sm text-slate-500">
          <Link to="/creations" className="font-bold text-blue-300 hover:text-blue-200">
            My creations
          </Link>
          <span className="mx-2">•</span>
          <Link to="/cards" className="font-bold text-blue-300 hover:text-blue-200">
            Trading cards
          </Link>
          <span className="mx-2">•</span>
          Made by <a href="https://latitudes.io" className="font-bold text-blue-400">Latitudes</a>
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
