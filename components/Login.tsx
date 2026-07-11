import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, LogIn } from 'lucide-react';
import { login } from '../services/api';
import Background from './Background';
import kieranLogo from '../kieran-logo.png';

interface LoginProps {
  onSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(code.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden text-slate-100">
      <Background />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md mx-4 p-8 rounded-3xl bg-slate-900/80 border border-slate-700 backdrop-blur shadow-2xl"
      >
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative group">
            <div className="absolute -inset-3 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 rounded-full blur-lg opacity-50 group-hover:opacity-90 animate-pulse" />
            <img
              src={kieranLogo}
              alt="Kieran's Imagination Logo"
              className="relative w-32 h-32 md:w-36 md:h-36 object-contain drop-shadow-2xl z-10"
            />
          </div>
          <h1 className="text-3xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Family Door
          </h1>
          <p className="text-slate-400 text-center text-sm">
            Enter the household access code to unlock Hot or Not and shared family Worlds.
            Creating coloring pages works without logging in.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="text-sm text-slate-300 flex items-center gap-2">
            <KeyRound size={16} /> Access code
          </label>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 focus:border-cyan-400 outline-none"
            placeholder="••••••••"
            required
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-bold disabled:opacity-50"
          >
            <LogIn size={18} />
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
        <p className="mt-6 text-center text-slate-500 text-xs">
          <a href="/worlds" className="text-cyan-400 hover:underline">
            Continue without login
          </a>
          {' · '}Hot or Not requires this code.
        </p>
      </motion.div>
    </div>
  );
};
