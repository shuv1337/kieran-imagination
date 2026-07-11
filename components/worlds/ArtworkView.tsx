import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Paintbrush,
  Sparkles,
  RefreshCw,
  Loader2,
  Download,
  Printer,
  Shuffle,
  Pin,
  History,
} from 'lucide-react';
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
    if (!worldId) return;
    const res = await listJobs({ worldId, active: true });
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
    if (worldId) {
      void listCharacters(worldId)
        .then((r) => setCharacters(r.characters))
        .catch(() => undefined);
    }
  }, [artworkId, worldId]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const t = setInterval(() => {
      void refreshJobs();
    }, 2000);
    return () => clearInterval(t);
  }, [activeJobs.length, artworkId, worldId]);

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
    if (!worldId || !artworkId || !parent) return;
    setBusy(opts.label || operation);
    try {
      const job = await runCreationJob({
        operation,
        quality: opts.quality || 'standard',
        instruction: opts.instruction,
        inputs: [{ assetId: parent.mediaAssetId, role: 'base', position: 0 }],
        worldId,
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
    if (!worldId || !current) return;
    setBusy('pin');
    try {
      const name = window.prompt('Name this character reference', 'Hero') || 'Hero';
      if (characters[0]) {
        await pinCharacter(worldId, characters[0].id, current.id);
      } else {
        await createCharacter(worldId, name, current.id);
      }
      const list = await listCharacters(worldId);
      setCharacters(list.characters);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Pin failed');
    } finally {
      setBusy(null);
    }
  };

  if (editing && imageUrl && current) {
    return (
      <Editor
        initialImage={imageUrl}
        fileName={`${artwork?.title || 'art'}.png`}
        parentRevisionId={current.id}
        artworkId={artworkId!}
        worldId={worldId!}
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
    <div className="min-h-screen flex flex-col relative text-slate-100">
      <Background />
      <header className="relative z-10 p-6 flex items-center gap-3">
        <Link to={`/worlds/${worldId}`} className="text-slate-400 hover:text-white">
          <ChevronLeft size={28} />
        </Link>
        <h1 className="text-2xl font-comic flex-1">{artwork?.title || 'Artwork'}</h1>
        {(busy || activeJobs.length > 0) && (
          <span className="text-sm text-amber-300 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            {busy || `${activeJobs[0]?.operation} · ${activeJobs[0]?.status}`}
          </span>
        )}
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pb-12 gap-6">
        {!imageUrl ? (
          <div className="text-slate-400 py-20 text-center">
            <p className="mb-4">
              {activeJobs.length > 0
                ? 'Generation in progress — hang tight…'
                : 'No revision yet — generate one.'}
            </p>
            {activeJobs.length === 0 && (
              <Link
                to={`/worlds/${worldId}/create?artworkId=${artworkId}`}
                className="text-cyan-400 underline"
              >
                Create
              </Link>
            )}
          </div>
        ) : (
          <>
            <img
              src={imageUrl}
              alt={artwork?.title || 'art'}
              className="max-h-[70vh] w-auto rounded-xl shadow-2xl bg-white"
            />
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-600"
              >
                <Paintbrush size={16} /> Edit
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void runChildJob('coloring.enhance', { label: 'enhance' })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700"
              >
                <Sparkles size={16} /> Enhance
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  void runChildJob('coloring.edit', {
                    instruction: FIX_COLORING,
                    label: 'fix',
                  })
                }
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-700"
              >
                <RefreshCw size={16} /> Fix coloring
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  void runChildJob('coloring.edit', {
                    instruction: REMIX_INSTRUCTION,
                    label: 'remix',
                  })
                }
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-700"
              >
                <Shuffle size={16} /> Remix
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  void runChildJob('coloring.enhance', {
                    quality: 'print',
                    label: 'print',
                    instruction:
                      'Prepare this as a high-detail printable black-and-white coloring page with clean outlines.',
                  })
                }
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700"
              >
                <Printer size={16} /> Print quality
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void handlePinCharacter()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700"
              >
                <Pin size={16} /> Pin character
              </button>
              <a
                href={imageUrl}
                download
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-700"
              >
                <Download size={16} /> Download
              </a>
            </div>

            {characters.length > 0 && (
              <p className="text-xs text-slate-400">
                Character refs: {characters.map((c) => c.name).join(', ')}
              </p>
            )}

            {revisions.length > 0 && (
              <section className="w-full max-w-xl">
                <h2 className="font-bold mb-2 flex items-center gap-2">
                  <History size={16} /> History
                </h2>
                <ul className="space-y-2 text-sm">
                  {revisions.map((r) => (
                    <li
                      key={r.id}
                      className={`p-2 rounded-lg border flex flex-wrap items-center gap-2 ${
                        r.id === current?.id ? 'border-cyan-500 bg-slate-800' : 'border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        className="text-left flex-1"
                        onClick={() => setViewRevisionId(r.id)}
                      >
                        {new Date(r.createdAt).toLocaleString()}
                        {r.prompt && (
                          <span className="text-slate-400"> · {r.prompt.slice(0, 40)}</span>
                        )}
                      </button>
                      {r.id !== artwork?.currentRevisionId && (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void handleRestore(r)}
                          className="text-xs px-2 py-1 rounded bg-cyan-800 hover:bg-cyan-700"
                        >
                          Restore
                        </button>
                      )}
                      {r.id !== current?.id && (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() =>
                            void runChildJob('coloring.edit', {
                              parent: r,
                              instruction: REMIX_INSTRUCTION,
                              label: 'continue',
                            })
                          }
                          className="text-xs px-2 py-1 rounded bg-slate-700"
                        >
                          Continue from here
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
    </div>
  );
};
