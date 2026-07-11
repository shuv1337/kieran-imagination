import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { HotOrNot } from './components/HotOrNot';
import { Login } from './components/Login';
import { WorldsHome } from './components/worlds/WorldsHome';
import { WorldDetail } from './components/worlds/WorldDetail';
import { WorldCreate } from './components/worlds/WorldCreate';
import { ArtworkView } from './components/worlds/ArtworkView';
import { CardDocumentEditor } from './components/cards/CardDocumentEditor';
import { NewCardRedirect } from './components/worlds/NewCardRedirect';
import { getSession } from './services/api';

/** Only used for Hot or Not — creation routes are open without login. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'yes' | 'no'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    void getSession()
      .then((s) => setState(s.authenticated ? 'yes' : 'no'))
      .catch(() => setState('no'));
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        Checking access…
      </div>
    );
  }
  if (state === 'no') {
    const next = `${window.location.pathname}${window.location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/worlds';

  return (
    <Login
      onSuccess={() => {
        // Only allow same-origin relative paths
        const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/worlds';
        navigate(dest, { replace: true });
      }}
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/hot"
        element={
          <RequireAuth>
            <HotOrNot />
          </RequireAuth>
        }
      />
      <Route
        path="/hotornot"
        element={
          <RequireAuth>
            <HotOrNot />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<LoginRoute />} />

      <Route path="/worlds" element={<WorldsHome />} />
      <Route path="/worlds/:worldId" element={<WorldDetail />} />
      <Route path="/worlds/:worldId/create" element={<WorldCreate />} />
      <Route path="/worlds/:worldId/artworks/:artworkId" element={<ArtworkView />} />
      <Route path="/worlds/:worldId/cards/new" element={<NewCardRedirect />} />
      <Route path="/worlds/:worldId/cards/:cardId" element={<CardDocumentEditor />} />

      {/* Legacy /cards → worlds */}
      <Route path="/cards" element={<Navigate to="/worlds" replace />} />

      {/* Home */}
      <Route path="/" element={<Navigate to="/worlds" replace />} />
      <Route path="*" element={<Navigate to="/worlds" replace />} />
    </Routes>
  );
}

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
