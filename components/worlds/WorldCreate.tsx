import React, { useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Upload, Sparkles, ChevronLeft } from 'lucide-react';
import { uploadFile, runCreationJob, assetUrl, listJobs, pollJob } from '../../services/jobs';
import { createArtwork, listCharacters } from '../../services/worlds';
import { fetchPublicSuggestions, improvePromptViaJob } from '../../services/textHelpers';
import Background from '../Background';
import { ErrorModal } from '../ErrorModal';

export const WorldCreate: React.FC = () => {
  const { worldId } = useParams<{ worldId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState('');
  const [uploadedAssetId, setUploadedAssetId] = useState<string | null>(null);
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [quality, setQuality] = useState<'draft' | 'standard' | 'print'>('standard');

  React.useEffect(() => {
    void fetchPublicSuggestions()
      .then(setSuggestions)
      .catch(() => undefined);
  }, []);

  // Reattach in-flight jobs after refresh
  React.useEffect(() => {
    if (!worldId) return;
    void listJobs({ worldId, active: true }).then(async (res) => {
      const artworkId = params.get('artworkId');
      const inflight = res.jobs.find(
        (j) =>
          (j.status === 'queued' || j.status === 'running') &&
          (!artworkId || j.artworkId === artworkId)
      );
      if (!inflight) return;
      setIsGenerating(true);
      setStage(`${inflight.status} · ${inflight.stage}`);
      try {
        const job = await pollJob(inflight.id, {
          onUpdate: (j) => setStage(`${j.status} · ${j.stage}`),
        });
        if (job.status === 'succeeded' && job.artworkId) {
          navigate(`/worlds/${worldId}/artworks/${job.artworkId}`);
        } else if (job.status !== 'succeeded') {
          setErrorMessage(job.errorMessage || 'Job failed');
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : 'Reconnect failed');
      } finally {
        setIsGenerating(false);
        setStage('');
      }
    });
  }, [worldId]);

  const handleFile = async (file: File) => {
    setPreviewLocal(URL.createObjectURL(file));
    try {
      const res = await uploadFile(file, file.name);
      setUploadedAssetId(res.assetId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const handleGenerate = async () => {
    if (!worldId || !prompt.trim()) return;
    setIsGenerating(true);
    setStage('Preparing…');
    try {
      let artworkId = params.get('artworkId');
      if (!artworkId) {
        const created = await createArtwork(worldId, 'coloring', prompt.slice(0, 60) || 'Coloring page');
        artworkId = created.artwork.id;
      }

      const inputs: Array<{ assetId: string; role: 'base' | 'character'; position: number }> =
        uploadedAssetId
          ? [{ assetId: uploadedAssetId, role: 'base', position: 0 }]
          : [];

      try {
        const chars = await listCharacters(worldId);
        const pinned = chars.characters.find((c) => c.pinnedMediaAssetId);
        if (pinned?.pinnedMediaAssetId) {
          inputs.push({
            assetId: pinned.pinnedMediaAssetId,
            role: 'character',
            position: 1,
          });
        }
      } catch {
        /* non-fatal */
      }

      setStage('Queued…');
      const job = await runCreationJob(
        {
          operation: 'coloring.generate',
          quality,
          prompt: prompt.trim(),
          inputs,
          worldId,
          artworkId,
        },
        {
          onUpdate: (j) => setStage(`${j.status} · ${j.stage}`),
        }
      );

      if (job.status !== 'succeeded') {
        throw new Error(job.errorMessage || 'Generation failed');
      }

      navigate(`/worlds/${worldId}/artworks/${artworkId}`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
      setStage('');
    }
  };

  const handleImprove = async () => {
    if (!prompt.trim()) return;
    try {
      const improved = await improvePromptViaJob(prompt);
      setPrompt(improved);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Improve failed');
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative text-slate-100">
      <Background />
      <header className="relative z-10 p-6 flex items-center gap-3">
        <Link to={`/worlds/${worldId}`} className="text-slate-400 hover:text-white">
          <ChevronLeft size={28} />
        </Link>
        <h1 className="text-2xl font-comic">Create coloring page</h1>
      </header>

      <main className="relative z-10 flex-1 px-6 pb-12 max-w-2xl mx-auto w-full space-y-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="A dinosaur playing guitar…"
          className="w-full px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-600 outline-none focus:border-cyan-400"
          disabled={isGenerating}
        />

        <div className="flex flex-wrap gap-2">
          {(['draft', 'standard', 'print'] as const).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuality(q)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                quality === q ? 'bg-cyan-600 border-cyan-400' : 'border-slate-600 bg-slate-800'
              }`}
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleImprove()}
            className="px-3 py-1.5 rounded-full text-sm border border-slate-600 bg-slate-800"
          >
            Improve prompt
          </button>
        </div>

        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-600"
          >
            <Upload size={16} /> Reference photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {previewLocal && (
            <img src={previewLocal} alt="ref" className="h-16 rounded-lg border border-slate-600" />
          )}
          {uploadedAssetId && (
            <span className="text-xs text-green-400">Uploaded · {uploadedAssetId.slice(0, 8)}</span>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrompt(s)}
                className="px-3 py-1.5 rounded-full text-sm bg-slate-800/80 border border-slate-700 hover:border-cyan-500"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={isGenerating || !prompt.trim()}
          onClick={() => void handleGenerate()}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 font-bold text-lg disabled:opacity-50"
        >
          <Sparkles size={20} />
          {isGenerating ? stage || 'Generating…' : 'Generate'}
        </button>

        {uploadedAssetId && (
          <p className="text-xs text-slate-500">
            Normalized asset ready: <code>{assetUrl(uploadedAssetId)}</code>
          </p>
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
