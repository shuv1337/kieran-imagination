import React, { useState } from 'react';
import { Generator } from './components/Generator';
import { Editor } from './components/Editor';
import { AppView } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.GENERATOR);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const handleImageGenerated = (imageUrl: string) => {
    setCurrentImage(imageUrl);
    setView(AppView.EDITOR);
  };

  const handleBackToGenerator = () => {
    setView(AppView.GENERATOR);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-[#d6deeb] bg-[#011627]">
      {/* Global Header */}
      {view === AppView.GENERATOR && (
        <header className="p-8 flex items-center justify-center">
          <div className="flex items-center gap-4 text-[#7e57c2]">
            <img 
              src="https://api.dicebear.com/9.x/avataaars/svg?seed=Kieran&backgroundColor=b6e3f4" 
              alt="Kieran's Imagination Logo" 
              className="w-16 h-16 rounded-full border-2 border-[#7e57c2] shadow-lg shadow-[#7e57c2]/20" 
            />
            <span className="text-4xl font-bold tracking-tight text-[#d6deeb]">Kieran's Imagination</span>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {view === AppView.GENERATOR && (
          <Generator onImageGenerated={handleImageGenerated} />
        )}
        
        {view === AppView.EDITOR && currentImage && (
          <Editor 
            initialImage={currentImage} 
            onBack={handleBackToGenerator}
          />
        )}
      </main>
      
      {view === AppView.GENERATOR && (
          <footer className="p-6 text-center text-[#5f7e97] text-sm">
            Powered by Gemini 2.5 Flash Image
          </footer>
      )}
    </div>
  );
};

export default App;