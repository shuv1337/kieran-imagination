import React, { useState, useRef } from 'react';
import { Upload, Sparkles, ArrowRight, Wand2, ImagePlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateColoringPage } from '../services/gemini';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface GeneratorProps {
  onImageGenerated: (imageUrl: string, fileName: string, key?: string, publicUrl?: string) => void;
}

export const Generator: React.FC<GeneratorProps> = ({ onImageGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestions = [
    '🦖 A T-Rex playing guitar',
    '🏰 A castle in the clouds',
    '🚀 A hamster astronaut',
    '🧙‍♂️ A wizard cat',
    '🦄 A rainbow unicorn',
    '🐙 A drummer octopus',
    '🏎️ A race car made of candy',
    '🧜‍♀️ A mermaid tea party',
    '🐉 A friendly dragon chef',
    '🤖 A robot building a snowman'
  ];

  const createFileName = (description: string) => {
    const cleaned = description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .join('-');
    const base = cleaned || 'kierans-art';
    return `${base}-${Date.now()}.png`;
  };

  const handleLuckyPrompt = () => {
    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    setPrompt(suggestion);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt && !uploadedImage) return;

    setIsGenerating(true);
    try {
      const effectivePrompt = prompt || "Convert this image into a fun coloring page.";
      const result = await generateColoringPage(effectivePrompt, uploadedImage || undefined);
      const fileName = createFileName(effectivePrompt);
      const preview = result.previewUrl || result.url;
      onImageGenerated(preview, fileName, result.key, result.url);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message === 'SAFETY_BLOCKED'
          ? "The AI couldn't create that because the prompt triggered content restrictions. Please try a kid-friendly idea!"
          : "Oops! Something went wrong generating the image. Please try again.";
      alert(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-6 flex flex-col gap-8">

      <div className="text-center space-y-4 relative">
        <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
        >
            <h1 className="text-6xl md:text-8xl font-comic text-white drop-shadow-[0_5px_0_rgba(0,0,0,0.5)]">
            Dream it. <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-500">Color it.</span>
            </h1>
        </motion.div>
        <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xl md:text-2xl text-blue-200 font-medium max-w-2xl mx-auto"
        >
          Type any idea below and watch AI turn it into a coloring page!
        </motion.p>
      </div>

      {/* Main Magic Card */}
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl ring-1 ring-white/20"
      >
        {/* Floating Orbs */}
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-500/30 rounded-full blur-3xl animate-pulse pointer-events-none"></div>
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-500/30 rounded-full blur-3xl animate-pulse pointer-events-none"></div>

        <div className="flex flex-col gap-6 relative z-10">
            
            {/* Prompt Input Area */}
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 rounded-3xl blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
                <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 group-focus-within:border-purple-400 transition-colors">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="I want a coloring page of..."
                        className="w-full p-6 text-2xl md:text-4xl bg-transparent text-white placeholder-slate-600 focus:outline-none resize-none h-48 font-bold font-comic leading-tight"
                    />
                    
                    {/* Lucky Button */}
                    <motion.button
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleLuckyPrompt}
                        className="absolute bottom-4 right-4 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full text-white font-bold flex items-center gap-2 shadow-lg hover:shadow-purple-500/50 transition-all"
                    >
                        <Sparkles size={18} className="text-yellow-300" />
                        I'm Feeling Lucky!
                    </motion.button>
                </div>
            </div>

            {/* Suggestions Cloud */}
            <div className="flex flex-wrap gap-3 justify-center">
                {suggestions.slice(0, 5).map((s, i) => (
                    <motion.button
                        key={s}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + (i * 0.1) }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setPrompt(s.split(' ').slice(1).join(' '))} // Remove emoji
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm md:text-base text-blue-200 transition-colors backdrop-blur-sm"
                    >
                        {s}
                    </motion.button>
                ))}
            </div>

            <div className="flex flex-col md:flex-row gap-6 mt-4">
                {/* Image Upload Zone */}
                <div className="flex-1">
                     <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={twMerge(
                            "relative h-24 rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden group flex items-center justify-center gap-4",
                            uploadedImage 
                                ? "border-green-400 bg-green-400/10" 
                                : "border-slate-600 hover:border-blue-400 hover:bg-slate-800/50"
                        )}
                     >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        
                        {uploadedImage ? (
                            <>
                                <img src={uploadedImage} alt="Ref" className="h-20 w-20 object-cover rounded-lg shadow-md" />
                                <div className="flex flex-col">
                                    <span className="font-bold text-green-400">Photo Added!</span>
                                    <span className="text-xs text-slate-400">Click to change</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setUploadedImage(null); }}
                                    className="absolute top-2 right-2 p-1 bg-slate-900/50 rounded-full hover:bg-red-500/80 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="p-3 bg-slate-800 rounded-xl group-hover:scale-110 transition-transform">
                                    <ImagePlus className="text-blue-400" />
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-slate-300 group-hover:text-white">Use a Photo</span>
                                    <span className="text-xs text-slate-500">Optional reference</span>
                                </div>
                            </>
                        )}
                     </div>
                </div>

                {/* BIG ACTION BUTTON */}
                <div className="flex-[2]">
                    <motion.button
                        onClick={handleGenerate}
                        disabled={isGenerating || (!prompt && !uploadedImage)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={twMerge(
                            "w-full h-24 rounded-2xl text-2xl md:text-3xl font-comic font-bold tracking-wide shadow-xl flex items-center justify-center gap-4 relative overflow-hidden transition-all",
                            (!prompt && !uploadedImage) 
                                ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                                : "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white hover:shadow-indigo-500/50"
                        )}
                    >
                        {isGenerating ? (
                            <div className="flex items-center gap-3">
                                <motion.div 
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                >
                                    <Wand2 size={32} className="text-yellow-300" />
                                </motion.div>
                                <span>Creating Magic...</span>
                            </div>
                        ) : (
                            <>
                                <span>Generate Page</span>
                                <ArrowRight size={32} className="group-hover:translate-x-2 transition-transform" />
                                {/* Shine effect */}
                                <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
                            </>
                        )}
                    </motion.button>
                </div>
            </div>
        </div>
      </motion.div>

    </div>
  );
};
