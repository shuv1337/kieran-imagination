import React from 'react';
import { ChevronLeft, Paintbrush, Sparkles, Download } from 'lucide-react';

interface PreviewProps {
  imageUrl: string;
  fileName: string;
  onBack: () => void;
  onEdit: () => void;
  onEnhance: () => void;
  isEnhancing: boolean;
}

export const Preview: React.FC<PreviewProps> = ({ imageUrl, fileName, onBack, onEdit, onEnhance, isEnhancing }) => {
  const linkHref = imageUrl.startsWith('data:') ? undefined : imageUrl;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = linkHref || imageUrl;
    link.download = fileName;
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col gap-8 px-6 py-10 bg-[#011627] text-[#d6deeb]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#5f7e97] font-semibold">Image Ready</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#d6deeb]">
            Preview before editing
          </h2>
          <p className="text-sm text-[#5f7e97]">Take a look at the full image first, then decide if you want to jump into editing.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#122d42] text-[#d6deeb] hover:border-[#82AAFF] hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
            Back to Generator
          </button>
          <button
            onClick={onEnhance}
            disabled={isEnhancing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#122d42] text-[#d6deeb] hover:border-[#82AAFF] hover:text-white transition-colors bg-[#0b253a] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isEnhancing ? (
              <>
                <span className="inline-block h-4 w-4 border-2 border-[#82AAFF] border-t-transparent rounded-full animate-spin" />
                Enhancing...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Enhance Detail
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#122d42] text-[#d6deeb] hover:border-[#82AAFF] hover:text-white transition-colors bg-[#0b253a]"
          >
            <Download size={18} />
            Download
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7e57c2] hover:bg-[#6c4ba6] text-white font-semibold shadow-lg shadow-[#7e57c2]/25 transition-transform hover:-translate-y-0.5"
          >
            <Paintbrush size={18} />
            Open in Editor
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-6xl h-[calc(100vh-240px)] bg-[#0b253a] border border-[#122d42] rounded-3xl shadow-2xl shadow-[#011627]/60 overflow-hidden p-4">
          <div className="w-full h-full bg-[#011627] rounded-2xl border border-dashed border-[#234d70] flex items-center justify-center">
            {linkHref ? (
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-full"
                title="Open image in a new tab"
              >
                <img
                  src={imageUrl}
                  alt="Generated coloring page"
                  className="w-full h-full object-contain rounded-xl shadow-inner"
                />
              </a>
            ) : (
              <img
                src={imageUrl}
                alt="Generated coloring page"
                className="w-full h-full object-contain rounded-xl shadow-inner"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-[#5f7e97]">
        <Sparkles size={18} className="text-[#82AAFF]" />
        <span>Love it as-is? Download from the editor or tweak details with AI tools.</span>
      </div>
    </div>
  );
};
