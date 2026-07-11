import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Globe, LogOut, LogIn } from 'lucide-react';
import { createWorld, listWorlds } from '../../services/worlds';
import { getSession, logout } from '../../services/api';
import type { ImaginationWorld } from '../../shared/worlds';
import Background from '../Background';
import kieranLogo from '../../kieran-logo.png';

export const WorldsHome: React.FC = () => {
  const [worlds, setWorlds] = useState<ImaginationWorld[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();

  const refresh = async () => {
    setLoading(true);
    try {
      const [res, session] = await Promise.all([listWorlds(), getSession().catch(() => ({ authenticated: false }))]);
      setWorlds(res.worlds);
      setAuthenticated(!!session.authenticated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load worlds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await createWorld(title.trim() || 'My World');
      navigate(`/worlds/${res.world.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create world');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative text-slate-100 overflow-hidden">
      <Background />
      <div className="relative z-10 p-4 md:p-6 flex justify-end">
        {authenticated ? (
          <button
            type="button"
            onClick={async () => {
              await logout();
              setAuthenticated(false);
              void refresh();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm hover:bg-slate-700"
          >
            <LogOut size={16} /> Logout
          </button>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm hover:bg-slate-700"
          >
            <LogIn size={16} /> Family login
          </Link>
        )}
      </div>

      {/* Hero branding — large logo from original Generator home */}
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 100 }}
        className="relative z-10 px-6 pb-4 md:pb-8 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8"
      >
        <motion.div
          className="relative group"
          whileHover={{ scale: 1.1, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 rounded-full blur-lg opacity-60 group-hover:opacity-100 animate-pulse" />
          <img
            src={kieranLogo}
            alt="Kieran's Imagination Logo"
            className="relative w-36 h-36 md:w-44 md:h-44 object-contain drop-shadow-2xl z-10"
          />
        </motion.div>
        <div className="flex flex-col items-center md:items-start relative">
          <motion.span
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-5xl md:text-7xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] transform -rotate-2"
          >
            Kieran&apos;s
          </motion.span>
          <motion.span
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-6xl md:text-8xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] -mt-2 md:-mt-4 transform rotate-1"
          >
            Imagination
          </motion.span>
          <p className="mt-3 text-slate-400 text-sm md:text-base text-center md:text-left max-w-md">
            {authenticated
              ? "Your family's shared Worlds live here"
              : 'Create Worlds freely — log in for shared family storage'}
          </p>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-8 -right-8 text-yellow-400 text-4xl pointer-events-none"
            aria-hidden
          >
            ✨
          </motion.div>
        </div>
      </motion.header>

      <main className="relative z-10 flex-1 px-6 pb-12 max-w-4xl mx-auto w-full">
        <form
          onSubmit={handleCreate}
          className="flex flex-col sm:flex-row gap-3 mb-8 p-4 rounded-2xl bg-slate-900/70 border border-slate-700"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name a new world…"
            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 font-bold disabled:opacity-50"
          >
            <Plus size={18} /> {creating ? 'Creating…' : 'New World'}
          </button>
        </form>

        {error && <p className="text-red-400 mb-4">{error}</p>}

        {loading ? (
          <p className="text-slate-400">Loading worlds…</p>
        ) : worlds.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Globe className="mx-auto mb-4 opacity-50" size={48} />
            <p>No worlds yet. Create one to start making art!</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {worlds.map((w) => (
              <motion.li key={w.id} whileHover={{ scale: 1.02 }}>
                <Link
                  to={`/worlds/${w.id}`}
                  className="block p-5 rounded-2xl bg-slate-900/80 border border-slate-700 hover:border-cyan-500/50 transition-colors"
                >
                  <h2 className="text-xl font-bold text-white mb-1">{w.title}</h2>
                  {w.description && (
                    <p className="text-slate-400 text-sm line-clamp-2">{w.description}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-3">
                    Updated {new Date(w.updatedAt).toLocaleString()}
                  </p>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};
