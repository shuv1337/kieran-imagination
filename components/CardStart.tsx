import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Palette, Sparkles, Type } from 'lucide-react';
import { motion } from 'framer-motion';
import Background from './Background';
import { ErrorModal } from './ErrorModal';
import { createCard, regenerateCardArt } from '../services/cards';
import { pollJob } from '../services/jobs';
import { getOrCreateCreationWorld } from '../services/worlds';
import { defaultCardDocument, type CardTheme } from '../shared/cards';

export const CardStart: React.FC = () => {
  const navigate = useNavigate();
  const [cardName, setCardName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [theme, setTheme] = useState<CardTheme>('creature');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!cardName.trim() || !prompt.trim() || busy) return;
    setBusy(true);
    setStage('Imagining your character…');
    try {
      const world = await getOrCreateCreationWorld();
      const document = defaultCardDocument(cardName.trim());
      document.presentation.theme = theme;
      const { card } = await createCard(world.id, {
        title: cardName.trim(),
        document,
      });
      const { jobId } = await regenerateCardArt(card.id, prompt.trim());
      const job = await pollJob(jobId, {
        onUpdate: (update) => {
          if (update.stage === 'model') setStage('Painting magical details…');
          else if (update.stage === 'normalize') setStage('Polishing your card art…');
          else if (update.stage === 'save') setStage('Finishing your card…');
        },
      });
      if (job.status !== 'succeeded') {
        throw new Error(job.errorMessage || 'Card creation did not finish.');
      }
      navigate(`/cards/${card.id}`, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create that card.');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const ready = cardName.trim().length > 0 && prompt.trim().length > 0 && !busy;

  return (
    <div className="min-h-screen overflow-x-hidden pb-16 font-sans text-slate-100 md:pb-0">
      <Background />

      <header className="relative z-10 flex items-center p-4 md:p-6">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-white/90 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft size={20} />
          <span className="hidden sm:inline">Back to Home</span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <h1 className="mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-4xl text-transparent drop-shadow-xl md:text-6xl">
            AI Character Generator
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-blue-100/80 md:text-xl">
            Describe your dream character and watch them come to life!
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full rounded-3xl border border-white/10 bg-slate-800/50 p-6 shadow-2xl ring-1 ring-white/5 backdrop-blur-xl md:p-8"
        >
          <div className="mb-8 grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <section>
                <h2 className="mb-3 text-lg font-semibold text-slate-300">Art Style</h2>
                <div className="grid grid-cols-2 gap-3">
                  {(['creature', 'custom'] as CardTheme[]).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setTheme(choice)}
                      className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border p-3 capitalize transition-all ${
                        theme === choice
                          ? 'border-purple-400 bg-gradient-to-br from-purple-600/50 to-pink-600/30 text-white shadow-lg shadow-purple-500/20'
                          : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      <Palette size={26} />
                      {choice === 'creature' ? 'Creature Card' : 'Custom Card'}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label htmlFor="card-name" className="mb-3 block text-lg font-semibold text-slate-300">
                  Character Name
                </label>
                <div className="group relative">
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 opacity-20 blur transition group-hover:opacity-40" />
                  <div className="relative flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 focus-within:border-blue-400">
                    <Type className="mr-3 text-slate-400" size={20} />
                    <input
                      id="card-name"
                      value={cardName}
                      onChange={(event) => setCardName(event.target.value)}
                      placeholder="e.g. Thunder Dragon"
                      maxLength={30}
                      className="w-full border-none bg-transparent font-medium text-white outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="flex h-full flex-col">
              <label htmlFor="card-prompt" className="mb-3 block text-lg font-semibold text-slate-300">
                Description
              </label>
              <div className="group relative min-h-64 flex-1">
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 opacity-20 blur transition group-hover:opacity-40" />
                <textarea
                  id="card-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe your character... (e.g. A brave knight with shining crystal armor)"
                  className="relative h-full min-h-64 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-4 leading-relaxed text-white outline-none placeholder:text-slate-500 focus:border-purple-400"
                />
              </div>
            </div>
          </div>

          <motion.button
            type="button"
            disabled={!ready}
            onClick={() => void handleCreate()}
            whileHover={ready ? { scale: 1.02 } : undefined}
            whileTap={ready ? { scale: 0.98 } : undefined}
            className={`flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 font-comic text-2xl font-bold shadow-xl ${
              ready
                ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shadow-purple-500/30'
                : 'cursor-not-allowed bg-slate-700 text-slate-500'
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="animate-spin" size={24} />
                <span aria-live="polite">{stage}</span>
              </>
            ) : (
              <>
                <Sparkles className="text-yellow-300" size={26} />
                Generate Character
              </>
            )}
          </motion.button>
        </motion.section>
      </main>

      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
    </div>
  );
};
