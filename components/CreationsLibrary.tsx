import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, ImagePlus, Loader2 } from 'lucide-react';
import Background from './Background';
import { assetUrl } from '../services/jobs';
import { getArtwork, getWorld, listWorlds } from '../services/worlds';
import { listCards } from '../services/cards';
import type { Artwork } from '../shared/worlds';
import type { CardDocument } from '../shared/cards';

interface ArtworkItem {
  artwork: Artwork;
  previewUrl: string | null;
}

export const CreationsLibrary: React.FC = () => {
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [cards, setCards] = useState<CardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { worlds } = await listWorlds();
        const activeWorlds = worlds.filter((world) => !world.archived);
        const worldResults = await Promise.all(
          activeWorlds.map(async (world) => {
            const [worldData, cardData] = await Promise.all([
              getWorld(world.id),
              listCards(world.id),
            ]);
            return { artworks: worldData.artworks, cards: cardData.cards };
          })
        );
        const allArtworks = worldResults
          .flatMap((result) => result.artworks)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        const artworkItems = await Promise.all(
          allArtworks.map(async (artwork) => {
            if (!artwork.currentRevisionId) return { artwork, previewUrl: null };
            try {
              const detail = await getArtwork(artwork.id);
              const current = detail.revisions.find(
                (revision) => revision.id === artwork.currentRevisionId
              );
              return {
                artwork,
                previewUrl: current ? assetUrl(current.mediaAssetId) : null,
              };
            } catch {
              return { artwork, previewUrl: null };
            }
          })
        );
        setArtworks(artworkItems);
        setCards(
          worldResults
            .flatMap((result) => result.cards)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load creations.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="min-h-screen relative text-slate-100">
      <Background />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-6 md:px-8">
        <Link
          to="/"
          aria-label="Back to create"
          className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="font-comic text-3xl text-cyan-300 md:text-4xl">My creations</h1>
          <p className="text-sm text-slate-300">Everything saves here automatically.</p>
        </div>
        <Link
          to="/"
          className="hidden items-center gap-2 rounded-full bg-blue-600 px-4 py-2 font-bold hover:bg-blue-500 sm:flex"
        >
          <ImagePlus size={18} /> Make something
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-300">
            <Loader2 className="animate-spin" /> Loading your creations…
          </div>
        ) : error ? (
          <p className="rounded-xl bg-red-950/70 p-4 text-red-200">{error}</p>
        ) : artworks.length === 0 && cards.length === 0 ? (
          <section className="mx-auto max-w-lg py-24 text-center">
            <ImagePlus className="mx-auto text-cyan-300" size={48} />
            <h2 className="mt-4 font-comic text-3xl">Make your first masterpiece</h2>
            <p className="mt-2 text-slate-300">
              Describe an idea and it will appear here automatically.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500"
            >
              Start creating
            </Link>
          </section>
        ) : (
          <div className="space-y-10">
            {artworks.length > 0 && (
              <section>
                <h2 className="mb-4 font-comic text-2xl text-white">Coloring pages</h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {artworks.map(({ artwork, previewUrl }) => (
                    <li key={artwork.id}>
                      <Link
                        to={'/artworks/' + artwork.id}
                        className="block overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-700 hover:ring-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      >
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt=""
                            className="aspect-[3/4] w-full bg-white object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center text-slate-500">
                            <ImagePlus />
                          </div>
                        )}
                        <div className="p-3">
                          <div className="truncate font-semibold">{artwork.title}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {new Date(artwork.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {cards.length > 0 && (
              <section>
                <h2 className="mb-4 font-comic text-2xl text-white">Trading cards</h2>
                <ul className="flex flex-wrap gap-3">
                  {cards.map((card) => (
                    <li key={card.id}>
                      <Link
                        to={'/cards/' + card.id}
                        className="flex min-w-48 items-center gap-3 rounded-xl bg-slate-900 p-4 ring-1 ring-slate-700 hover:ring-purple-400"
                      >
                        <CreditCard className="text-purple-300" />
                        <span className="font-semibold">{card.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
