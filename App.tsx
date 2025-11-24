import React, { useState } from 'react';
import { Generator } from './components/Generator';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
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
      alert("Couldn't enhance the image. Please try again.");
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-[#d6deeb] bg-[#011627]">
      {/* Global Header */}
      {view === AppView.GENERATOR && (
        <header className="p-4 md:p-8 flex items-center justify-center">
          <div className="flex items-center gap-3 md:gap-4 text-[#7e57c2]">
            <img
              src={kieranLogo}
              alt="Kieran's Imagination Logo"
              className="w-24 h-24 md:w-32 md:h-32 rounded-full border-2 border-[#7e57c2] shadow-lg shadow-[#7e57c2]/20"
            />
            <span className="text-2xl md:text-4xl font-bold tracking-tight text-[#d6deeb]">Kieran's Imagination</span>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {view === AppView.GENERATOR && (
          <Generator onImageGenerated={handleImageGenerated} />
        )}

        {view === AppView.PREVIEW && currentImageData && (
          <Preview
            imageUrl={currentImageUrl || currentImageData}
            fileName={currentFileName}
            onBack={handleBackToGenerator}
            onEdit={handleOpenEditor}
            onEnhance={handleEnhanceDetail}
            isEnhancing={isEnhancing}
          />
        )}

        {view === AppView.EDITOR && currentImageData && (
          <Editor
            initialImage={currentImageData}
            fileName={currentFileName}
            onBack={handleBackToPreview}
          />
        )}
      </main>

      {view === AppView.GENERATOR && (
        <footer className="p-6 text-center text-[#5f7e97] text-sm">
          Powered by Gemini 3
        </footer>
      )}
    </div>
  );
};

export default App;
