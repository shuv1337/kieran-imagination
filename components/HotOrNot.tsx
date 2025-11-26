import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, ThumbsDown, Trophy, TrendingUp, Loader2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface ImageWithRating {
  id: string;
  url: string;
  prompt: string;
  created_at: number;
  hot_votes: number;
  not_votes: number;
  rating: number;
  total_votes: number;
  user_vote: string | null;
  hot_score: number;
}

interface HotOrNotProps {
  // Optional props for customization
}

export const HotOrNot: React.FC<HotOrNotProps> = () => {
  const [images, setImages] = useState<ImageWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [voteAnimations, setVoteAnimations] = useState<Record<string, 'hot' | 'not' | null>>({});
  
  const ITEMS_PER_PAGE = 12;

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hot?limit=${ITEMS_PER_PAGE}&offset=${page * ITEMS_PER_PAGE}`);
      if (!res.ok) throw new Error('Failed to fetch images');
      const data = await res.json();
      setImages(data.images);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleVote = async (imageId: string, voteType: 'hot' | 'not') => {
    if (votingId) return;
    
    setVotingId(imageId);
    setVoteAnimations(prev => ({ ...prev, [imageId]: voteType }));
    
    try {
      const res = await fetch('/api/hot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, voteType }),
      });
      
      if (!res.ok) throw new Error('Vote failed');
      
      const data = await res.json();
      
      // Update local state
      setImages(prev => prev.map(img => {
        if (img.id !== imageId) return img;
        
        let newHot = img.hot_votes;
        let newNot = img.not_votes;
        let newUserVote: string | null = null;
        
        if (data.action === 'removed') {
          if (img.user_vote === 'hot') newHot--;
          if (img.user_vote === 'not') newNot--;
        } else if (data.action === 'changed') {
          if (img.user_vote === 'hot') newHot--;
          if (img.user_vote === 'not') newNot--;
          if (voteType === 'hot') newHot++;
          if (voteType === 'not') newNot++;
          newUserVote = voteType;
        } else if (data.action === 'added') {
          if (voteType === 'hot') newHot++;
          if (voteType === 'not') newNot++;
          newUserVote = voteType;
        }
        
        return {
          ...img,
          hot_votes: newHot,
          not_votes: newNot,
          rating: newHot - newNot,
          total_votes: newHot + newNot,
          user_vote: newUserVote,
        };
      }));
      
    } catch (err) {
      console.error('Vote error:', err);
    } finally {
      setVotingId(null);
      setTimeout(() => {
        setVoteAnimations(prev => ({ ...prev, [imageId]: null }));
      }, 500);
    }
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const getRankBadge = (index: number) => {
    const rank = page * ITEMS_PER_PAGE + index + 1;
    if (rank === 1) return { icon: Trophy, color: 'from-yellow-400 to-amber-500', label: '#1' };
    if (rank === 2) return { icon: Trophy, color: 'from-slate-300 to-slate-400', label: '#2' };
    if (rank === 3) return { icon: Trophy, color: 'from-amber-600 to-amber-700', label: '#3' };
    return null;
  };

  const getHotness = (rating: number, totalVotes: number, createdAt: number) => {
    const hoursOld = (Date.now() - createdAt) / (1000 * 60 * 60);
    
    // Show "FRESH" badge for images less than 24 hours old with few votes
    if (hoursOld < 24 && totalVotes < 5) {
      return { level: 'fresh', color: 'text-green-400', label: 'FRESH' };
    }
    if (totalVotes === 0) return { level: 'new', color: 'text-slate-400', label: 'NEW' };
    
    const ratio = totalVotes > 0 ? (rating / totalVotes + 1) / 2 : 0.5;
    if (ratio > 0.8) return { level: 'fire', color: 'text-orange-500', label: 'ON FIRE!' };
    if (ratio > 0.6) return { level: 'hot', color: 'text-red-400', label: 'HOT' };
    if (ratio > 0.4) return { level: 'warm', color: 'text-yellow-400', label: 'WARM' };
    if (ratio > 0.2) return { level: 'cool', color: 'text-blue-400', label: 'COOL' };
    return { level: 'cold', color: 'text-cyan-400', label: 'NOT' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 text-white">
      {/* Fun Header */}
      <header className="py-8 px-4">
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center"
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Flame className="w-12 h-12 text-orange-500" />
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-comic font-bold">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 tracking-wider pr-1">
                HOT
              </span>
              <span className="text-white mx-3">or</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                NOT?
              </span>
            </h1>
            <motion.div
              animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
            >
              <ThumbsDown className="w-12 h-12 text-blue-400" />
            </motion.div>
          </div>
          <p className="text-xl text-slate-300 font-medium">
            Rate the coloring pages! Vote for your favorites
          </p>
          <div className="flex items-center justify-center gap-2 mt-2 text-sm text-slate-500">
            <TrendingUp size={16} />
            <span>Sorted by hot score (popularity + freshness)</span>
          </div>
        </motion.div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pb-12">
        {loading && images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-12 h-12 text-purple-400" />
            </motion.div>
            <p className="text-slate-400">Loading hot pics...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-xl">{error}</p>
            <button 
              onClick={fetchImages}
              className="mt-4 px-6 py-2 bg-purple-600 rounded-full hover:bg-purple-500 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <p className="text-slate-400 text-xl">No images yet! Generate some first.</p>
          </div>
        ) : (
          <>
            {/* Image Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {images.map((image, index) => {
                  const rankBadge = getRankBadge(index);
                  const hotness = getHotness(image.rating, image.total_votes, image.created_at);
                  const voteAnim = voteAnimations[image.id];
                  
                  return (
                    <motion.div
                      key={image.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="relative group"
                    >
                      <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-700/50 hover:border-purple-500/50 transition-all">
                        {/* Rank Badge */}
                        {rankBadge && (
                          <div className={`absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-gradient-to-r ${rankBadge.color} text-black font-bold text-sm flex items-center gap-1 shadow-lg`}>
                            <rankBadge.icon size={14} />
                            {rankBadge.label}
                          </div>
                        )}

                        {/* Hotness Label */}
                        <div className={`absolute top-3 right-3 z-20 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm font-bold text-xs ${hotness.color}`}>
                          {hotness.label}
                        </div>

                        {/* Image */}
                        <div className="aspect-square relative overflow-hidden bg-white">
                          <img
                            src={image.url}
                            alt={image.prompt}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                          
                          {/* Vote Animation Overlay */}
                          <AnimatePresence>
                            {voteAnim && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.5 }}
                                className={`absolute inset-0 flex items-center justify-center ${
                                  voteAnim === 'hot' ? 'bg-orange-500/30' : 'bg-blue-500/30'
                                }`}
                              >
                                {voteAnim === 'hot' ? (
                                  <Flame className="w-24 h-24 text-orange-500" />
                                ) : (
                                  <ThumbsDown className="w-24 h-24 text-blue-400" />
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Stats & Voting */}
                        <div className="p-4">
                          {/* Rating Bar */}
                          <div className="mb-3">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                              <span className="text-orange-400">{image.hot_votes} Hot</span>
                              <span className="text-blue-400">{image.not_votes} Not</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
                              <motion.div
                                className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                                initial={{ width: 0 }}
                                animate={{ 
                                  width: image.total_votes > 0 
                                    ? `${(image.hot_votes / image.total_votes) * 100}%` 
                                    : '50%' 
                                }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                              />
                              <motion.div
                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                                initial={{ width: 0 }}
                                animate={{ 
                                  width: image.total_votes > 0 
                                    ? `${(image.not_votes / image.total_votes) * 100}%` 
                                    : '50%' 
                                }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                              />
                            </div>
                            <div className="text-center text-xs text-slate-500 mt-1">
                              {image.total_votes} vote{image.total_votes !== 1 ? 's' : ''}
                            </div>
                          </div>

                          {/* Vote Buttons */}
                          <div className="flex gap-2">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleVote(image.id, 'hot')}
                              disabled={votingId === image.id}
                              className={`flex-1 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                image.user_vote === 'hot'
                                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30'
                                  : 'bg-slate-700/50 text-slate-300 hover:bg-orange-500/20 hover:text-orange-400'
                              }`}
                            >
                              <Flame size={18} />
                              HOT
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleVote(image.id, 'not')}
                              disabled={votingId === image.id}
                              className={`flex-1 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                image.user_vote === 'not'
                                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
                                  : 'bg-slate-700/50 text-slate-300 hover:bg-blue-500/20 hover:text-blue-400'
                              }`}
                            >
                              <ThumbsDown size={18} />
                              NOT
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-3 rounded-full bg-slate-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
                >
                  <ChevronLeft size={24} />
                </motion.button>
                
                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i;
                    } else if (page < 3) {
                      pageNum = i;
                    } else if (page > totalPages - 4) {
                      pageNum = totalPages - 5 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    
                    return (
                      <motion.button
                        key={pageNum}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-full font-bold transition-all ${
                          page === pageNum
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {pageNum + 1}
                      </motion.button>
                    );
                  })}
                </div>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-3 rounded-full bg-slate-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
                >
                  <ChevronRight size={24} />
                </motion.button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Fun Footer */}
      <footer className="text-center py-8 text-slate-500 text-sm">
        <p>Vote responsibly. Every coloring page has feelings.</p>
      </footer>
    </div>
  );
};

export default HotOrNot;
