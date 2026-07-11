import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ImagePlus, CreditCard, Loader2 } from 'lucide-react';
import { getWorld, createArtwork } from '../../services/worlds';
import { listCards, createCard } from '../../services/cards';
import { listJobs } from '../../services/jobs';
import type { Artwork, ImaginationWorld } from '../../shared/worlds';
import type { CardDocument } from '../../shared/cards';
import type { JobStatusResponse } from '../../shared/jobs';
import Background from '../Background';

export const WorldDetail: React.FC = () => {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const [world, setWorld] = useState<ImaginationWorld | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [cards, setCards] = useState<CardDocument[]>([]);
  const [jobs, setJobs] = useState<JobStatusResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!worldId) return;
    setLoading(true);
    try {
      const res = await getWorld(worldId);
      setWorld(res.world);
      setArtworks(res.artworks);
      const cardRes = await listCards(worldId);
      setCards(cardRes.cards);
      const jobRes = await listJobs({ worldId, active: true });
      setJobs(jobRes.jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load world');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [worldId]);

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  useEffect(() => {
    if (activeCount === 0) return;
    const t = setInterval(() => {
      if (!worldId) return;
      void listJobs({ worldId, active: true }).then(async (r) => {
        const nextActive = r.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
        setJobs(r.jobs);
        if (nextActive === 0) {
          await load();
        }
      });
    }, 2000);
    return () => clearInterval(t);
  }, [activeCount, worldId]);

  const startCreate = async () => {
    if (!worldId) return;
    const res = await createArtwork(worldId, 'coloring', 'New coloring page');
    navigate(`/worlds/${worldId}/create?artworkId=${res.artwork.id}`);
  };

  const startCard = async () => {
    if (!worldId) return;
    const res = await createCard(worldId, { title: 'New Card' });
    navigate(`/worlds/${worldId}/cards/${res.card.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-300">
        <Loader2 className="animate-spin mr-2" /> Loading world…
      </div>
    );
  }

  if (!world) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-300">
        <p>{error || 'World not found'}</p>
        <Link to="/worlds" className="text-cyan-400">
          Back to worlds
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative text-slate-100">
      <Background />
      <header className="relative z-10 p-6 flex items-center gap-4">
        <Link to="/worlds" className="text-slate-400 hover:text-white">
          <ChevronLeft size={28} />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-purple-400">
            {world.title}
          </h1>
          {world.description && <p className="text-slate-400 text-sm">{world.description}</p>}
        </div>
      </header>

      <main className="relative z-10 px-6 pb-16 max-w-5xl mx-auto w-full space-y-8">
        {error && <p className="text-red-400">{error}</p>}

        {jobs.length > 0 && (
          <section className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <h2 className="font-bold text-amber-200 mb-2 flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} /> Active jobs
            </h2>
            <ul className="space-y-1 text-sm text-amber-100/90">
              {jobs.map((j) => (
                <li key={j.id}>
                  {j.operation} · {j.status} · {j.stage}
                  {j.artworkId && (
                    <Link className="ml-2 text-cyan-300 underline" to={`/worlds/${worldId}/artworks/${j.artworkId}`}>
                      open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void startCreate()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold"
          >
            <ImagePlus size={18} /> New coloring page
          </button>
          <button
            type="button"
            onClick={() => void startCard()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 font-bold"
          >
            <CreditCard size={18} /> New trading card
          </button>
        </div>

        <section>
          <h2 className="text-xl font-bold mb-3">Artworks</h2>
          {artworks.length === 0 ? (
            <p className="text-slate-500">No artworks yet.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              {artworks.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/worlds/${worldId}/artworks/${a.id}`}
                    className="block p-4 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-cyan-500/40"
                  >
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {a.kind} · {a.currentRevisionId ? 'has revision' : 'empty'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">Cards</h2>
          {cards.length === 0 ? (
            <p className="text-slate-500">No cards yet.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              {cards.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/worlds/${worldId}/cards/${c.id}`}
                    className="block p-4 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-purple-500/40"
                  >
                    <div className="font-semibold">{c.title}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};
