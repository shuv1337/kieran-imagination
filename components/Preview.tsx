import React from 'react';
import { ChevronLeft, Paintbrush, Sparkles, Download, Share2, Printer } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface PreviewProps {
  imageUrl: string;
  fileName: string;
  onBack: () => void;
  onEdit: () => void;
  onEnhance: () => void;
  isEnhancing: boolean;
}

export const Preview: React.FC<PreviewProps> = ({ imageUrl, fileName, onBack, onEdit, onEnhance, isEnhancing }) => {
  const handleDownload = async () => {
    try {
      // Fetch the image as a blob to ensure proper download across all browsers
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open image in new tab
      window.open(imageUrl, '_blank');
    }
  };

  const handlePrint = () => {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(`
              <html>
                  <head><title>Print Coloring Page</title></head>
                  <body style="margin:0; display:flex; justify-content:center; align-items:center; height:100vh;">
                      <img src="${imageUrl}" style="max-width:100%; max-height:100%; object-fit:contain;" />
                      <script>window.onload = () => { window.print(); window.close(); }</script>
                  </body>
              </html>
          `);
          printWindow.document.close();
      }
  };

  return (
    <div className="flex-1 flex flex-col gap-8 px-4 py-6 md:px-8 md:py-10 max-w-7xl mx-auto w-full">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold uppercase tracking-widest rounded-full border border-green-500/30">
                Ready to Color!
            </span>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-comic text-white drop-shadow-lg"
          >
            Your Masterpiece
          </motion.h2>
        </div>

        <div className="flex flex-wrap gap-3">
           <button
            onClick={onBack}
            className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors flex items-center gap-2"
          >
            <ChevronLeft size={20} /> Back
          </button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onEdit}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-bold shadow-lg shadow-pink-500/25 flex items-center gap-2"
          >
            <Paintbrush size={20} />
            Open Editor
          </motion.button>
        </div>
      </div>

      {/* Main Showcase Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
        
        {/* Image Container */}
        <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.4, delay: 0.2 }}
            className="flex-[2] relative group"
        >
            <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 rounded-[2.5rem] blur-xl opacity-30 group-hover:opacity-50 transition duration-700"></div>
            <div className="relative h-full min-h-[400px] bg-white rounded-[2rem] p-4 shadow-2xl overflow-hidden flex items-center justify-center border-4 border-white/50">
                {/* Checkered background for transparency */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                
                <img
                    src={imageUrl}
                    alt="Generated coloring page"
                    className="relative max-w-full max-h-[70vh] object-contain drop-shadow-xl z-10"
                />

                {/* Zoom hint overlay */}
                <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    High Quality Preview
                </div>
            </div>
        </motion.div>

        {/* Sidebar Actions */}
        <div className="flex-1 lg:max-w-sm flex flex-col gap-4">
            
            <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-3xl p-6 flex flex-col gap-4"
            >
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-yellow-400" /> 
                    AI Magic Tools
                </h3>
                
                <button
                    onClick={onEnhance}
                    disabled={isEnhancing}
                    className={clsx(
                        "w-full py-4 px-4 rounded-2xl border-2 border-dashed flex items-center gap-4 transition-all group text-left",
                        isEnhancing 
                            ? "border-purple-500/50 bg-purple-500/10 cursor-not-allowed" 
                            : "border-slate-600 hover:border-purple-400 hover:bg-slate-700/50"
                    )}
                >
                    <div className={clsx(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                        isEnhancing ? "bg-purple-500/20 text-purple-300" : "bg-slate-700 text-slate-300 group-hover:bg-purple-500 group-hover:text-white"
                    )}>
                        {isEnhancing ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Sparkles size={20} /></motion.div> : <Sparkles size={20} />}
                    </div>
                    <div>
                        <div className="font-bold text-slate-200 group-hover:text-white">Enhance Details</div>
                        <div className="text-xs text-slate-400">Sharpen lines & add patterns</div>
                    </div>
                </button>
            </motion.div>

            <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-3xl p-6 flex flex-col gap-3"
            >
                <h3 className="text-xl font-bold text-white">Share & Save</h3>
                
                <button 
                    onClick={handleDownload}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5"
                >
                    <Download size={20} /> Download Image
                </button>
                
                <button 
                    onClick={handlePrint}
                    className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                    <Printer size={20} /> Print Now
                </button>
            </motion.div>

        </div>

      </div>
    </div>
  );
};
