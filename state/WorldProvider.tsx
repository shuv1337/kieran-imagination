import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { JobStatusResponse } from '../shared/jobs';
import type { Artwork, ImaginationWorld, WorldCharacter } from '../shared/worlds';
import { getWorld, listWorlds } from '../services/worlds';
import { listJobs } from '../services/jobs';
import { listCards } from '../services/cards';
import type { CardDocument } from '../shared/cards';

interface WorldContextValue {
  worlds: ImaginationWorld[];
  world: ImaginationWorld | null;
  artworks: Artwork[];
  characters: WorldCharacter[];
  cards: CardDocument[];
  activeJobs: JobStatusResponse[];
  loading: boolean;
  error: string | null;
  refreshWorlds: () => Promise<void>;
  loadWorld: (worldId: string) => Promise<void>;
  refreshActiveJobs: (worldId?: string) => Promise<void>;
}

const WorldContext = createContext<WorldContextValue | null>(null);

export function WorldProvider({ children }: { children: React.ReactNode }) {
  const [worlds, setWorlds] = useState<ImaginationWorld[]>([]);
  const [world, setWorld] = useState<ImaginationWorld | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [characters, setCharacters] = useState<WorldCharacter[]>([]);
  const [cards, setCards] = useState<CardDocument[]>([]);
  const [activeJobs, setActiveJobs] = useState<JobStatusResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWorlds = useCallback(async () => {
    try {
      const res = await listWorlds();
      setWorlds(res.worlds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load worlds');
    }
  }, []);

  const refreshActiveJobs = useCallback(async (worldId?: string) => {
    try {
      const res = await listJobs({ worldId, active: true });
      setActiveJobs(res.jobs);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadWorld = useCallback(
    async (worldId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getWorld(worldId);
        setWorld(res.world);
        setArtworks(res.artworks);
        setCharacters(res.characters);
        const cardRes = await listCards(worldId);
        setCards(cardRes.cards);
        await refreshActiveJobs(worldId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load world');
      } finally {
        setLoading(false);
      }
    },
    [refreshActiveJobs]
  );

  useEffect(() => {
    void refreshWorlds();
  }, [refreshWorlds]);

  // Poll active jobs while any are running
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const worldId = world?.id;
    const t = setInterval(() => {
      void refreshActiveJobs(worldId);
    }, 2000);
    return () => clearInterval(t);
  }, [activeJobs.length, world?.id, refreshActiveJobs]);

  const value = useMemo(
    () => ({
      worlds,
      world,
      artworks,
      characters,
      cards,
      activeJobs,
      loading,
      error,
      refreshWorlds,
      loadWorld,
      refreshActiveJobs,
    }),
    [
      worlds,
      world,
      artworks,
      characters,
      cards,
      activeJobs,
      loading,
      error,
      refreshWorlds,
      loadWorld,
      refreshActiveJobs,
    ]
  );

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>;
}

export function useWorld(): WorldContextValue {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error('useWorld must be used within WorldProvider');
  return ctx;
}
