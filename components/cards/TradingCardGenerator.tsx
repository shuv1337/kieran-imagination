import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowLeft, Download, Share2, RefreshCw, Palette, Type, Swords, Printer, Image as ImageIcon, X } from 'lucide-react';
import { CardTheme, CardRarity } from '../../types';
import { CardThemeSelector } from './CardThemeSelector';
import { CardTemplateCarousel } from './CardTemplateCarousel';
import { CardFrame } from './CardFrame';
import { CARD_TEMPLATES, CardTemplate } from './cardTemplates';
import { generateTradingCard, TradingCardResponse, fixCardText, generateNewAttacks } from '../../services/gemini';
import Background from '../Background';
import { ErrorModal } from '../ErrorModal';

interface TradingCardGeneratorProps {
  onBack?: () => void;
}

// Progress stages for card generation
const progressStages = [
  { message: "Imagining your character...", duration: 3000 },
  { message: "Adding magical details...", duration: 4000 },
  { message: "Painting vibrant colors...", duration: 5000 },
  { message: "Crafting the perfect card...", duration: 8000 },
  { message: "Almost there...", duration: 10000 },
];

export const TradingCardGenerator: React.FC<TradingCardGeneratorProps> = ({ onBack }) => {
  const [prompt, setPrompt] = useState('');
  const [cardName, setCardName] = useState('');
  const [theme, setTheme] = useState<CardTheme>(CardTheme.POKEMON);
  // Rarity is kept in state for API compatibility but not shown in UI
  const [rarity, setRarity] = useState<CardRarity>(CardRarity.COMMON);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editAction, setEditAction] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState(0);
  const [generatedCard, setGeneratedCard] = useState<TradingCardResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Removed showRarityPicker and printArtOnly state
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTemplateSelect = (template: CardTemplate) => {
    setPrompt(template.prompt);
    setCardName(template.name);
    setTheme(template.theme);
    setRarity(template.suggestedRarity);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !cardName.trim()) return;

    setIsGenerating(true);
    setProgressStage(0);
    setGeneratedCard(null);

    // Progress animation
    let stageIndex = 0;
    const progressInterval = setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, progressStages.length - 1);
      setProgressStage(stageIndex);
    }, progressStages[stageIndex]?.duration || 3000);

    try {
      const result = await generateTradingCard({
        prompt,
        theme,
        rarity,
        cardName,
        baseImage: baseImage || undefined,
      });
      setGeneratedCard(result);
    } catch (error) {
      console.error('Card generation failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate card. Please try again.');
    } finally {
      clearInterval(progressInterval);
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    await handleGenerate();
  };

  const handleBack = () => {
    if (generatedCard) {
      setGeneratedCard(null);
      return;
    }
    if (onBack) {
      onBack();
    } else {
      window.location.href = '/';
    }
  };

  const generateCardImage = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;

    // Save original styles
    const originalWidth = cardRef.current.style.width;
    const originalHeight = cardRef.current.style.height;
    const originalMaxWidth = cardRef.current.style.maxWidth;
    const originalTransform = cardRef.current.style.transform;

    try {
      // Enforce 5:7 aspect ratio dimensions for high quality capture
      // 500px x 700px is a good base size
      cardRef.current.style.width = '500px';
      cardRef.current.style.height = '700px';
      cardRef.current.style.maxWidth = 'none';
      // Remove any transform scaling that might distort the capture
      cardRef.current.style.transform = 'none';

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2, // effectively 1000x1400 output
        width: 500,
        height: 700,
        useCORS: true,
        allowTaint: true,
        ignoreElements: (element) => element.hasAttribute('data-html2canvas-ignore'),
        onclone: (doc) => {
          // Ensure the cloned element also respects these dimensions if needed
          // html2canvas sometimes uses the onclone styling
        }
      });
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch (error) {
      console.error('Failed to generate card image:', error);
      return null;
    } finally {
      // Restore original styles
      if (cardRef.current) {
        cardRef.current.style.width = originalWidth;
        cardRef.current.style.height = originalHeight;
        cardRef.current.style.maxWidth = originalMaxWidth;
        cardRef.current.style.transform = originalTransform;
      }
    }
  };

  const handleDownload = async () => {
    if (!generatedCard) return;

    try {
      // Use the preview URL or persistent URL directly
      const imageUrl = generatedCard.previewUrl || generatedCard.url;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.download = `${generatedCard.cardName.replace(/\s+/g, '-').toLowerCase()}-card.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      setErrorMessage('Failed to download card. Please try again.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!generatedCard) return;

    try {
      if (navigator.share) {
        const imageUrl = generatedCard.previewUrl || generatedCard.url;
        const response = await fetch(imageUrl);
        const blob = await response.blob();

        if (blob) {
          const file = new File([blob], `${generatedCard.cardName.replace(/\s+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${generatedCard.cardName}`,
              text: `Check out my custom trading card character: ${generatedCard.cardName}!`,
            });
            return;
          }
        }

        // Fallback to sharing URL if file share fails or isn't supported
        await navigator.share({
          title: `${generatedCard.cardName} - Trading Card`,
          text: `Check out my custom trading card: ${generatedCard.cardName}!`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      }
    } catch (err) {
      // User cancelled or share failed silently
      console.error('Share failed:', err);
    }
  };

  const handleFixText = async () => {
    if (!generatedCard) return;

    setIsEditing(true);
    setEditAction('fix-text');

    try {
      const result = await fixCardText(generatedCard.previewUrl, generatedCard.cardName);
      setGeneratedCard({
        ...generatedCard,
        previewUrl: result.previewUrl,
        url: result.url,
        key: result.key,
      });
    } catch (error) {
      console.error('Fix text failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to fix text. Please try again.');
    } finally {
      setIsEditing(false);
      setEditAction(null);
    }
  };

  const handleNewAttacks = async () => {
    if (!generatedCard) return;

    setIsEditing(true);
    setEditAction('new-attacks');

    try {
      const result = await generateNewAttacks(generatedCard.previewUrl, generatedCard.cardName, theme);
      setGeneratedCard({
        ...generatedCard,
        previewUrl: result.previewUrl,
        url: result.url,
        key: result.key,
      });
    } catch (error) {
      console.error('New attacks failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate new attacks. Please try again.');
    } finally {
      setIsEditing(false);
      setEditAction(null);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image size should be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setBaseImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeBaseImage = () => {
    setBaseImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste if we're focused on an input element (unless it's an image)
      // Actually, we want to allow pasting images even when focused on inputs,
      // but we shouldn't preventDefault if it's text being pasted into an input.

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              // Custom logic to handle the file
              if (file.size > 5 * 1024 * 1024) {
                setErrorMessage('Image size should be less than 5MB');
                return;
              }
              const reader = new FileReader();
              reader.onload = (event) => {
                if (event.target?.result) {
                  setBaseImage(event.target.result as string);
                }
              };
              reader.readAsDataURL(file);

              e.preventDefault(); // Prevent default paste behavior only for images
            }
            break; // Only handle the first image found
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Show card preview if generated
  if (generatedCard) {
    return (
      <div className="min-h-screen flex flex-col font-sans text-slate-100 relative overflow-x-hidden print:bg-white print:text-black print:overflow-visible">
        <style>{`
          @media print {
            @page {
              size: auto;
              margin: 0mm;
            }
            body {
              background-color: white !important;
              color: black !important;
            }
            header, button, nav, footer, .background-container, .print-hidden {
              display: none !important;
            }
            main {
              padding: 0 !important;
              margin: 0 !important;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .card-container {
              transform: scale(1.5);
              margin: auto;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        `}</style>
        <div className="print-hidden">
          <Background />
        </div>

        {/* Header */}
        <motion.header
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-4 md:p-6 flex items-center justify-between z-10 print-hidden"
        >
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Create Another</span>
          </button>

          <div className="flex flex-col items-center">
            <span className="text-xl md:text-2xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
              Your Card
            </span>
          </div>

          <div className="w-16" />
        </motion.header>

        {/* Card Preview */}
        <main className="flex-1 flex flex-col items-center z-10 px-4 md:px-8 pb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-full max-w-xs mb-8 card-container"
            ref={cardRef}
          >
            <CardFrame
              imageUrl={generatedCard.previewUrl}
              cardName={generatedCard.cardName}
              theme={theme}
              rarity={rarity}
            />
          </motion.div>

          {/* Editing overlay */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col items-center justify-center"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mb-6"
                />
                <p className="text-xl font-medium text-white text-center">
                  {editAction === 'fix-text' ? 'Fixing text...' : 'Generating new attacks...'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* This section was empty in the original code, assuming it was meant to contain action buttons */}
          </motion.div>
        </main>

        <ErrorModal
          isOpen={!!errorMessage}
          onClose={() => setErrorMessage(null)}
          message={errorMessage || ''}
        />
      </div>
    );
  }

  // Initial Configuration State
  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-100 relative overflow-x-hidden">
      <Background />

      {/* Header */}
      <header className="p-4 md:p-6 flex items-center relative z-10">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all text-white/90 hover:text-white"
        >
          <ArrowLeft size={20} />
          <span className="hidden sm:inline">Back to Home</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10 w-full max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-6xl mb-4 drop-shadow-xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">AI Character Generator</span><span className="text-transparent">.</span>
          </h1>
          <p className="text-lg md:text-xl text-blue-100/80 max-w-2xl mx-auto">
            Describe your dream character and watch them come to life!
          </p>
        </div>

        {/* Input Form */}
        <div className="w-full bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl ring-1 ring-white/5">

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Left Column: Style & Name */}
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3 text-slate-300">Art Style</h3>
                <CardThemeSelector
                  selectedTheme={theme}
                  onSelect={setTheme}
                />
              </section>

              <section>
                <label className="block text-lg font-semibold mb-3 text-slate-300">Character Name</label>
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                  <div className="relative bg-slate-900 rounded-xl border border-slate-700 flex items-center px-4 py-3 group-focus-within:border-blue-400 transition-colors">
                    <Type className="text-slate-400 mr-3" size={20} />
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="e.g. Thunder Dragon"
                      className="bg-transparent border-none outline-none text-white placeholder-slate-500 w-full font-medium"
                      maxLength={30}
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Prompt */}
            <div className="flex flex-col h-full">
              <label className="block text-lg font-semibold mb-3 text-slate-300">Description</label>
              <div className="relative group flex-1">
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <div className="relative h-full bg-slate-900 rounded-xl border border-slate-700 flex flex-col group-focus-within:border-purple-400 transition-colors">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your character... (e.g. A brave knight with shining armor made of crystals)"
                    className="bg-transparent border-none outline-none text-white placeholder-slate-500 w-full flex-1 p-4 resize-none leading-relaxed"
                  />

                  {/* Image Input (inside textarea container) */}
                  <div className="p-3 border-t border-slate-800 bg-slate-900/50 rounded-b-xl flex items-center justify-between">
                    {baseImage ? (
                      <div className="flex items-center gap-3 bg-slate-800 rounded-lg pr-3 pl-2 py-1.5 border border-slate-700">
                        <img src={baseImage} alt="Reference" className="w-8 h-8 rounded object-cover border border-slate-600" />
                        <span className="text-xs text-green-400 font-medium">Image added</span>
                        <button
                          onClick={removeBaseImage}
                          className="p-1 hovered:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs flex items-center gap-2 text-slate-400 hover:text-purple-300 transition-colors px-2 py-1"
                        >
                          <ImageIcon size={16} />
                          <span>Upload or Paste a photo to use as reference</span>
                        </button>
                      </div>
                    )}
                    <span className="text-xs text-slate-500">{prompt.length}/500</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Image Upload (Visible only if not active, redundant but helpful for mobile layout if needed due to space) */}
          {/* Skipping specific mobile button to keep clean layout described above */}

          {/* Generate Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
            disabled={!prompt || isGenerating}
            className={`w-full py-5 rounded-2xl font-bold text-xl shadow-lg relative overflow-hidden group transition-all ${!prompt || isGenerating
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-indigo-500/25 hover:shadow-indigo-500/40'
              }`}
          >
            {isGenerating ? (
              <div className="flex items-center justify-center gap-3">
                <RefreshCw className="animate-spin" />
                <span>Creating Magic...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="group-hover:rotate-12 transition-transform" />
                <span>Generate Character</span>
              </div>
            )}
          </motion.button>

        </div>
      </main>

      <ErrorModal
        isOpen={!!errorMessage}
        message={errorMessage || ''}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
};

export default TradingCardGenerator;
