import React, { useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { generateColoringPage } from '../services/gemini';

interface GeneratorProps {
  onImageGenerated: (imageUrl: string) => void;
}

export const Generator: React.FC<GeneratorProps> = ({ onImageGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

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
      onImageGenerated(result);
    } catch (error) {
      console.error(error);
      alert("Oops! Something went wrong generating the image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 pt-12">
      
      <div className="text-center mb-16">
        <h1 className="text-6xl font-bold text-[#d6deeb] mb-6 tracking-tight font-fredoka">
          Dream it. <span className="text-[#82AAFF]">Color it.</span>
        </h1>
        <p className="text-xl text-[#5f7e97] max-w-2xl mx-auto">
          Enter Kieran's Imagination. Use AI to turn your wildest ideas or photos into amazing coloring pages instantly.
        </p>
      </div>

      {/* Main Card - Using Night Owl 'input.background' (#0b253a) as surface for contrast against #011627 */}
      <div className="bg-[#0b253a] rounded-3xl shadow-2xl shadow-[#011627]/50 p-8 border border-[#122d42]">
        
        <div className="space-y-8">
          
          <div>
            <label className="block text-sm font-bold text-[#82AAFF] mb-2 uppercase tracking-wide">
              What do you want to create?
            </label>
            <div className="relative">
              {/* Input using input background and border colors */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g., A robot dinosaur playing soccer on Mars..."
                className="w-full p-5 text-lg bg-[#011627] border-2 border-[#5f7e97] text-[#d6deeb] rounded-2xl focus:border-[#82AAFF] focus:ring-0 transition-all outline-none resize-none h-36 placeholder-[#5f7e97]/50"
              />
              <div className="absolute bottom-4 right-4 text-[#82AAFF] animate-pulse pointer-events-none">
                <Sparkles size={24} />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            
            {/* Image Upload */}
            <div className="flex-1">
               <label className="block text-sm font-bold text-[#82AAFF] mb-2 uppercase tracking-wide">
                 Use a Photo (Optional)
               </label>
               <div className="relative group h-[88px]">
                 <input 
                   type="file" 
                   accept="image/*"
                   onChange={handleFileChange}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                 />
                 <div className={`h-full border-2 border-dashed rounded-2xl px-4 flex items-center gap-4 transition-all ${uploadedImage ? 'border-[#82AAFF] bg-[#234d70]/30' : 'border-[#5f7e97] bg-[#011627] group-hover:border-[#82AAFF]'}`}>
                   {uploadedImage ? (
                     <>
                       <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#0b253a] shadow-sm shrink-0">
                         <img src={uploadedImage} alt="Reference" className="w-full h-full object-cover" />
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="text-sm font-semibold text-[#d6deeb] truncate">Photo added!</p>
                         <p className="text-xs text-[#5f7e97]">Click to replace</p>
                       </div>
                       <button 
                         onClick={(e) => {
                           e.preventDefault(); 
                           setUploadedImage(null);
                         }}
                         className="z-20 p-2 text-[#5f7e97] hover:text-[#EF5350]"
                       >
                         x
                       </button>
                     </>
                   ) : (
                     <>
                       <div className="w-10 h-10 rounded-full bg-[#0b253a] flex items-center justify-center text-[#5f7e97]">
                         <Upload size={20} />
                       </div>
                       <div>
                         <p className="text-sm font-semibold text-[#d6deeb]">Upload Reference</p>
                         <p className="text-xs text-[#5f7e97]">Use a photo as a base</p>
                       </div>
                     </>
                   )}
                 </div>
               </div>
            </div>

            {/* Action Button - Using Night Owl Button Color #7e57c2 */}
            <div className="flex-1">
                <label className="block text-sm font-bold text-transparent mb-2 uppercase tracking-wide select-none">
                 Action
               </label>
               <button
                 onClick={handleGenerate}
                 disabled={isGenerating || (!prompt && !uploadedImage)}
                 className="w-full h-[88px] bg-[#7e57c2] hover:bg-[#6c4ba6] disabled:bg-[#234d70] disabled:text-[#5f7e97] disabled:cursor-not-allowed text-white text-xl font-bold rounded-2xl shadow-lg hover:shadow-[#7e57c2]/25 hover:-translate-y-1 transition-all flex items-center justify-center gap-3"
               >
                 {isGenerating ? (
                   <>
                     <div className="animate-spin rounded-full h-6 w-6 border-4 border-[#d6deeb] border-t-transparent"></div>
                     Creating Magic...
                   </>
                 ) : (
                   <>
                     Generate Page <ArrowRight size={24} />
                   </>
                 )}
               </button>
            </div>

          </div>

        </div>
      </div>

      {/* Features Grid */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-4 p-5 bg-[#0b253a]/50 border border-[#122d42] rounded-2xl">
          <div className="p-3 bg-[#82AAFF]/10 text-[#82AAFF] rounded-xl">
            <ImageIcon size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#d6deeb]">Clean Line Art</h3>
            <p className="text-xs text-[#5f7e97]">Optimized for printing</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-5 bg-[#0b253a]/50 border border-[#122d42] rounded-2xl">
           <div className="p-3 bg-[#c792ea]/10 text-[#c792ea] rounded-xl">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#d6deeb]">AI Editing</h3>
            <p className="text-xs text-[#5f7e97]">Modify with simple text</p>
          </div>
        </div>
         <div className="flex items-center gap-4 p-5 bg-[#0b253a]/50 border border-[#122d42] rounded-2xl">
           <div className="p-3 bg-[#ffeb95]/10 text-[#ffeb95] rounded-xl">
            <Upload size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#d6deeb]">Photo to Page</h3>
            <p className="text-xs text-[#5f7e97]">Convert memories to art</p>
          </div>
        </div>
      </div>
    </div>
  );
};