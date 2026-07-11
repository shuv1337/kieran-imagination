import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { createCard } from '../../services/cards';
import Background from '../Background';

/** /worlds/:worldId/cards/new — create a card and navigate to the editor. */
export const NewCardRedirect: React.FC = () => {
  const { worldId } = useParams<{ worldId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!worldId) return;
    void createCard(worldId, { title: 'New Card' })
      .then((res) => {
        navigate(`/worlds/${worldId}/cards/${res.card.id}`, { replace: true });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to create card'));
  }, [worldId, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative text-slate-100">
      <Background />
      <div className="relative z-10 text-center">
        {error ? (
          <>
            <p className="text-red-400 mb-4">{error}</p>
            <Link to={`/worlds/${worldId}`} className="text-cyan-400 underline">
              Back to world
            </Link>
          </>
        ) : (
          <p className="text-slate-300">Creating card…</p>
        )}
      </div>
    </div>
  );
};
