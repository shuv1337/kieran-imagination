import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { Login } from './components/Login';
import { CreatorHome } from './components/CreatorHome';
import { CreationsLibrary } from './components/CreationsLibrary';
import { ArtworkView } from './components/worlds/ArtworkView';
import { CardDocumentEditor } from './components/cards/CardDocumentEditor';
import { CardStart } from './components/CardStart';

function LoginRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  return (
    <Login
      onSuccess={() => {
        const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';
        navigate(destination, { replace: true });
      }}
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<CreatorHome />} />
      <Route path="/creations" element={<CreationsLibrary />} />
      <Route path="/artworks/:artworkId" element={<ArtworkView />} />
      <Route path="/cards" element={<CardStart />} />
      <Route path="/cards/:cardId" element={<CardDocumentEditor />} />
      <Route path="/login" element={<LoginRoute />} />

      {/* Old links remain valid: Hot or Not is retired, and users no longer navigate through Worlds. */}
      <Route path="/hot" element={<Navigate to="/" replace />} />
      <Route path="/hotornot" element={<Navigate to="/" replace />} />
      <Route path="/worlds" element={<Navigate to="/creations" replace />} />
      <Route path="/worlds/:worldId" element={<Navigate to="/creations" replace />} />
      <Route path="/worlds/:worldId/create" element={<Navigate to="/" replace />} />
      <Route path="/worlds/:worldId/artworks/:artworkId" element={<ArtworkView />} />
      <Route path="/worlds/:worldId/cards/new" element={<CardStart />} />
      <Route path="/worlds/:worldId/cards/:cardId" element={<CardDocumentEditor />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const App: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);

export default App;
