import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Generator } from './components/Generator';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { HotOrNot } from './components/HotOrNot';
import Background from './components/Background';
import { ErrorModal } from './components/ErrorModal';
import { AppView } from './types';
import kieranLogo from './kieran-logo.png';
import { aiEditImage } from './services/gemini';
import { saveGeneratedImage } from './services/storage';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.GENERATOR);
  const [currentImageData, setCurrentImageData] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('kierans-art.png');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isHotRoute, setIsHotRoute] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Simple route detection for /hot and /hotornot
  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      setIsHotRoute(path === '/hot' || path === '/hotornot');
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  const persistImage = async (dataUrl: string, fileName: string) => {
    try {
      const url = await saveGeneratedImage(dataUrl, fileName);
      setCurrentImageUrl(url);
    } catch (error) {
      console.error('Failed to persist image', error);
      setCurrentImageUrl(dataUrl); // fallback to data URL if save fails
    }
  };

  const handleImageGenerated = (imageUrl: string, fileName: string, _key?: string, publicUrl?: string) => {
    setCurrentImageData(imageUrl);
    setCurrentImageUrl(publicUrl || null);
    setCurrentFileName(fileName);
    setView(AppView.PREVIEW);
    if (!publicUrl) {
      void persistImage(imageUrl, fileName);
    }
  };

  const handleBackToGenerator = () => {
    setView(AppView.GENERATOR);
  };

  const handleOpenEditor = () => {
    setView(AppView.EDITOR);
  };

  const handleBackToPreview = () => {
    setView(AppView.PREVIEW);
  };

  const handleEnhanceDetail = async () => {
    if (!currentImageData) return;
    setIsEnhancing(true);
    try {
      const enhanced = await aiEditImage(
        currentImageData,
        'Add more crisp black line art detail and small patterns to the existing shapes while keeping it a clean, printable black-and-white coloring page. Do not add shading, grayscale, colors, textures, frames, or backgrounds.'
      );
      const enhancedFileName = `${(currentFileName.replace(/\.png$/i, '') || 'kierans-art')}-enhanced.png`;
      const previewUrl = enhanced.previewUrl || enhanced.url;
      setCurrentImageData(previewUrl);
      setCurrentImageUrl(enhanced.url || null);
      setCurrentFileName(enhancedFileName);
      if (!enhanced.url) {
        void persistImage(previewUrl, enhancedFileName);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Couldn't enhance the image. Please try again.");
    } finally {
      setIsEnhancing(false);
    }
  };

  // Render HotOrNot page for /hot route
  if (isHotRoute) {
    return <HotOrNot />;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-100 relative overflow-hidden">
      <Background />
      
      {/* Global Header */}
      <AnimatePresence>
        {view === AppView.GENERATOR && (
          <motion.header 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="p-6 md:p-10 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 z-10"
          >
            <motion.div 
              className="relative group cursor-pointer"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 rounded-full blur-lg opacity-60 group-hover:opacity-100 animate-pulse"></div>
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
                transition={{ delay: 0.2 }}
                className="text-5xl md:text-7xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] transform -rotate-2"
              >
                Kieran's
              </motion.span>
              <motion.span 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-6xl md:text-8xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] -mt-2 md:-mt-4 transform rotate-1"
              >
                Imagination
              </motion.span>
              
              {/* Decorative elements */}
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -top-8 -right-8 text-yellow-400 text-4xl"
              >
                ✨
              </motion.div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col z-10 relative">
        <AnimatePresence mode="wait">
          {view === AppView.GENERATOR && (
            <motion.div
              key="generator"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
              transition={{ duration: 0.5 }}
              className="flex-1 w-full"
            >
              <Generator onImageGenerated={handleImageGenerated} />
            </motion.div>
          )}

          {view === AppView.PREVIEW && currentImageData && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ type: "spring", damping: 20 }}
              className="flex-1 flex flex-col"
            >
              <Preview
                imageUrl={currentImageUrl || currentImageData}
                fileName={currentFileName}
                onBack={handleBackToGenerator}
                onEdit={handleOpenEditor}
                onEnhance={handleEnhanceDetail}
                isEnhancing={isEnhancing}
              />
            </motion.div>
          )}

          {view === AppView.EDITOR && currentImageData && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="flex-1 flex flex-col"
            >
              <Editor
                initialImage={currentImageData}
                fileName={currentFileName}
                onBack={handleBackToPreview}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {view === AppView.GENERATOR && (
        <footer className="p-6 text-center text-slate-500 text-sm relative z-10">
          <p>Made by <span className="text-blue-400 font-bold"><a href="https://latitudes.io">Latitudes</a></span></p>
        </footer>
      )}

      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
    </div>
  );
};

export default App;
