import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Download, Undo, Redo, Eraser, Pen, Sparkles, 
  Image as ImageIcon, ChevronLeft, PaintBucket, 
  Type as TypeIcon, Sliders, Grid3X3, Maximize, Scaling
} from 'lucide-react';
import { aiEditImage, aiUpscaleImage } from '../services/gemini';
import { ToolType, PatternType, TextureType } from '../types';

interface EditorProps {
  initialImage: string;
  fileName?: string;
  onBack: () => void;
}

export const Editor: React.FC<EditorProps> = ({ initialImage, fileName, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // State
  const [tool, setTool] = useState<ToolType>('brush');
  const [brushSize, setBrushSize] = useState(5);
  const [brushOpacity, setBrushOpacity] = useState(100); // 0-100
  const [color, setColor] = useState('#000000');
  const [fillPattern, setFillPattern] = useState<PatternType>('solid');
  const [texture, setTexture] = useState<TextureType>('none');
  
  // Text Tool State
  const [textInput, setTextInput] = useState({ visible: false, x: 0, y: 0, value: '' });

  // History
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);

  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.src = initialImage;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      saveToHistory();
    };
  }, [initialImage]);

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(dataUrl);
    
    // Limit history to 20 steps to save memory
    if (newHistory.length > 20) newHistory.shift();
    
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  const loadFromHistory = (step: number) => {
    const canvas = canvasRef.current;
    if (!canvas || step < 0 || step >= history.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = history[step];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistoryStep(step);
    };
  };

  // --- Helpers for Patterns & Textures ---

  const createPatternCanvas = (type: PatternType, color: string) => {
    const pCanvas = document.createElement('canvas');
    const pCtx = pCanvas.getContext('2d');
    pCanvas.width = 20;
    pCanvas.height = 20;
    if (!pCtx) return null;

    pCtx.fillStyle = color;
    pCtx.strokeStyle = color;

    switch (type) {
      case 'solid':
        return null; // Use simple fillStyle
      case 'stripes':
        pCtx.beginPath();
        pCtx.lineWidth = 2;
        pCtx.moveTo(0, 0); pCtx.lineTo(20, 20);
        pCtx.moveTo(10, -10); pCtx.lineTo(30, 10);
        pCtx.moveTo(-10, 10); pCtx.lineTo(10, 30);
        pCtx.stroke();
        break;
      case 'dots':
        pCtx.beginPath();
        pCtx.arc(10, 10, 4, 0, Math.PI * 2);
        pCtx.fill();
        break;
      case 'grid':
        pCtx.lineWidth = 1;
        pCtx.strokeRect(0, 0, 20, 20);
        break;
      case 'check':
        pCtx.fillRect(0, 0, 10, 10);
        pCtx.fillRect(10, 10, 10, 10);
        break;
    }
    return pCanvas;
  };

  const applyTexture = (type: TextureType) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || type === 'none') return;

    // Save state before texture
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.3;

    // We draw a procedural texture
    if (type === 'paper') {
       // Simple noise
       for (let i = 0; i < canvas.width; i+=2) {
           for (let j = 0; j < canvas.height; j+=2) {
               if (Math.random() > 0.5) {
                   ctx.fillStyle = '#ccc';
                   ctx.fillRect(i, j, 1, 1);
               }
           }
       }
    } else if (type === 'watercolor') {
        // Large faint blobs
        ctx.globalAlpha = 0.1;
        for (let k=0; k<50; k++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const r = Math.random() * 100 + 50;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI*2);
            ctx.fillStyle = '#ddd';
            ctx.fill();
        }
    }

    ctx.restore();
    saveToHistory();
  };

  // --- Tool Implementations ---

  const floodFill = (startX: number, startY: number, fillColor: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    // Helper to get color at pixel
    const getPixel = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i+1], data[i+2], data[i+3]];
    };

    const targetColor = getPixel(startX, startY);
    
    // Parse hex fillColor
    const r = parseInt(fillColor.slice(1, 3), 16);
    const g = parseInt(fillColor.slice(3, 5), 16);
    const b = parseInt(fillColor.slice(5, 7), 16);
    const a = 255;

    if (targetColor[0] === r && targetColor[1] === g && targetColor[2] === b) return;

    const tolerance = 50;
    const colorMatch = (c1: number[], c2: number[]) => {
        return Math.abs(c1[0] - c2[0]) < tolerance &&
               Math.abs(c1[1] - c2[1]) < tolerance &&
               Math.abs(c1[2] - c2[2]) < tolerance;
    };

    const stack = [[startX, startY]];

    while (stack.length) {
      const pos = stack.pop();
      if (!pos) continue;
      const x = pos[0];
      const y = pos[1];

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const currentPixel = getPixel(x, y);
      if (colorMatch(currentPixel, targetColor)) {
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i+1] = g;
        data[i+2] = b;
        data[i+3] = a;

        stack.push([x+1, y]);
        stack.push([x-1, y]);
        stack.push([x, y+1]);
        stack.push([x, y-1]);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    saveToHistory();
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === 'text') {
        // Handle text placement
        handleCanvasClickForText(e);
        return;
    }
    if (tool === 'fill') {
        const { x, y } = getCoords(e);
        // Math.floor to get pixel coords
        floodFill(Math.floor(x), Math.floor(y), color);
        return;
    }
    if (tool === 'texture') return; // Texture is applied via button usually

    setIsDrawing(true);
    draw(e);
  };

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
     const canvas = canvasRef.current;
     if (!canvas) return {x:0, y:0};
     const rect = canvas.getBoundingClientRect();
     const scaleX = canvas.width / rect.width;
     const scaleY = canvas.height / rect.height;
     
     let clientX, clientY;
     if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
     } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
     }
     
     return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
     };
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getCoords(e);

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = brushOpacity / 100;
        
        if (fillPattern !== 'solid' && tool === 'brush') {
            const pCanvas = createPatternCanvas(fillPattern, color);
            if (pCanvas) {
                const p = ctx.createPattern(pCanvas, 'repeat');
                if (p) ctx.strokeStyle = p;
            } else {
                ctx.strokeStyle = color;
            }
        } else {
            ctx.strokeStyle = color;
        }
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => {
    if (isDrawing) {
        setIsDrawing(false);
        const ctx = canvasRef.current?.getContext('2d');
        ctx?.beginPath();
        saveToHistory();
    }
  };

  // --- Text Tool Logic ---
  const handleCanvasClickForText = (e: React.MouseEvent | React.TouchEvent) => {
     if (textInput.visible) {
         commitText(); // Commit existing if clicking elsewhere
     }
     const { x, y } = getCoords(e);
     // We need screen coords for the input element
     const canvas = canvasRef.current;
     const rect = canvas?.getBoundingClientRect();
     if (!rect) return;
     
     setTextInput({ visible: true, x, y, value: '' });
     setTimeout(() => textInputRef.current?.focus(), 10);
  };

  const commitText = () => {
      if (!textInput.value) {
          setTextInput({ ...textInput, visible: false });
          return;
      }
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
          ctx.font = `${brushSize * 5}px Fredoka`; // Scale font with brush size
          ctx.fillStyle = color;
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillText(textInput.value, textInput.x, textInput.y);
          saveToHistory();
      }
      setTextInput({ ...textInput, visible: false });
  };

  // --- AI Handlers ---
  
  const handleAiAction = async (action: 'edit' | 'upscale') => {
      if (!canvasRef.current) return;
      setIsProcessing(true);
      try {
          const current = canvasRef.current.toDataURL('image/png');
          let result;
          if (action === 'upscale') {
              result = await aiUpscaleImage(current);
          } else {
              if (!aiPrompt) return;
              result = await aiEditImage(current, aiPrompt);
              setAiPrompt('');
          }
          
          const img = new Image();
          img.src = result;
          img.onload = () => {
              if (canvasRef.current) {
                  canvasRef.current.width = img.width;
                  canvasRef.current.height = img.height;
                  const ctx = canvasRef.current.getContext('2d');
                  ctx?.drawImage(img, 0, 0);
                  saveToHistory();
              }
              setIsProcessing(false);
          }
      } catch (e) {
          console.error(e);
          setIsProcessing(false);
          alert("AI Magic failed. Please try again.");
      }
  };

  // --- Render ---

  const colors = ['#000000', '#FFFFFF', '#EF5350', '#22da6e', '#82AAFF', '#c5e478', '#C792EA', '#f6bbe5', '#5f7e97'];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-[#011627] text-[#d6deeb]">
        
      {/* Top Bar - Using #0b253a (surface) and #122d42 (border) */}
      <div className="h-14 border-b border-[#122d42] bg-[#0b253a] px-4 flex items-center justify-between z-20">
        <button onClick={onBack} className="flex items-center gap-2 text-[#5f7e97] hover:text-[#d6deeb] transition-colors">
            <ChevronLeft size={20} /> <span className="font-bold">Back</span>
        </button>

        <div className="flex items-center gap-2">
            <button onClick={() => loadFromHistory(historyStep - 1)} disabled={historyStep <= 0} className="p-2 text-[#5f7e97] hover:bg-[#234d70] rounded-full disabled:opacity-30">
                <Undo size={18}/>
            </button>
            <button onClick={() => loadFromHistory(historyStep + 1)} disabled={historyStep >= history.length - 1} className="p-2 text-[#5f7e97] hover:bg-[#234d70] rounded-full disabled:opacity-30">
                <Redo size={18}/>
            </button>
            <div className="h-6 w-px bg-[#122d42] mx-2"></div>
            <button onClick={() => {
                const link = document.createElement('a');
                link.download = fileName || 'kierans-art.png';
                link.href = canvasRef.current?.toDataURL() || '';
                link.click();
            }} className="bg-[#7e57c2] hover:bg-[#6c4ba6] text-white px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2">
                <Download size={16} /> Save
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
          
          {/* Toolbar */}
          <div className="w-16 md:w-20 bg-[#0b253a] border-r border-[#122d42] flex flex-col items-center py-4 gap-4 z-20 overflow-y-auto">
              {[
                  { t: 'brush', i: <Pen size={20} />, l: 'Brush' },
                  { t: 'eraser', i: <Eraser size={20} />, l: 'Eraser' },
                  { t: 'fill', i: <PaintBucket size={20} />, l: 'Fill' },
                  { t: 'text', i: <TypeIcon size={20} />, l: 'Text' },
                  { t: 'texture', i: <Grid3X3 size={20} />, l: 'Texture' },
                  { t: 'ai-edit', i: <Sparkles size={20} />, l: 'AI Magic' },
              ].map((item) => (
                  <button
                    key={item.t}
                    onClick={() => setTool(item.t as ToolType)}
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${tool === item.t ? 'bg-[#7e57c2] text-white shadow-lg shadow-[#7e57c2]/50' : 'text-[#5f7e97] hover:bg-[#234d70] hover:text-[#d6deeb]'}`}
                    title={item.l}
                  >
                      {item.i}
                  </button>
              ))}
          </div>

          {/* Sub-Toolbar (Contextual) */}
          <div className="w-64 bg-[#0b253a] border-r border-[#122d42] p-4 flex flex-col gap-6 overflow-y-auto z-20">
              <h3 className="text-sm font-bold text-[#5f7e97] uppercase tracking-wider mb-2">
                  {tool === 'ai-edit' ? 'AI Magic Tools' : 'Tool Settings'}
              </h3>

              {tool === 'ai-edit' ? (
                  <div className="space-y-4">
                      <div className="bg-[#011627] p-3 rounded-xl border border-[#122d42]">
                          <label className="text-xs font-bold text-[#82AAFF] mb-2 block">AI Edit</label>
                          <textarea 
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="Add a hat, remove background..."
                            className="w-full bg-[#0b253a] border-[#5f7e97] rounded-lg p-2 text-sm text-[#d6deeb] mb-2 h-20 resize-none focus:border-[#82AAFF] focus:outline-none"
                          />
                          <button 
                            onClick={() => handleAiAction('edit')}
                            disabled={isProcessing || !aiPrompt}
                            className="w-full bg-[#7e57c2] hover:bg-[#6c4ba6] disabled:bg-[#234d70] text-white py-2 rounded-lg text-xs font-bold"
                          >
                              {isProcessing ? 'Processing...' : 'Generate Edit'}
                          </button>
                      </div>
                      <div className="bg-[#011627] p-3 rounded-xl border border-[#122d42]">
                          <label className="text-xs font-bold text-[#C792EA] mb-2 block">Upscale</label>
                          <p className="text-xs text-[#5f7e97] mb-3">Enhance quality and sharpen lines.</p>
                          <button 
                            onClick={() => handleAiAction('upscale')}
                            disabled={isProcessing}
                            className="w-full bg-[#C792EA] hover:bg-[#b074e6] disabled:bg-[#234d70] text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                          >
                              <Scaling size={14} /> Upscale Image
                          </button>
                      </div>
                  </div>
              ) : (
                  <>
                    {/* Common: Color Picker */}
                    {(tool === 'brush' || tool === 'fill' || tool === 'text') && (
                        <div>
                            <label className="text-xs text-[#5f7e97] font-bold mb-2 block">Color</label>
                            <div className="grid grid-cols-5 gap-2">
                                {colors.map(c => (
                                    <button 
                                        key={c} 
                                        onClick={() => setColor(c)}
                                        style={{ backgroundColor: c }}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-[#82AAFF] scale-110' : 'border-[#122d42] hover:scale-105'}`} 
                                    />
                                ))}
                                <input 
                                  type="color" 
                                  value={color} 
                                  onChange={(e) => setColor(e.target.value)} 
                                  className="w-8 h-8 rounded-full overflow-hidden border-0 p-0 cursor-pointer"
                                />
                            </div>
                        </div>
                    )}

                    {/* Brush/Text Size */}
                    {(tool === 'brush' || tool === 'eraser' || tool === 'text') && (
                         <div>
                             <label className="text-xs text-[#5f7e97] font-bold mb-2 block">
                                 {tool === 'text' ? 'Font Size' : 'Brush Size'}
                             </label>
                             <input 
                                type="range" min="1" max="100" 
                                value={brushSize} 
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-full accent-[#7e57c2] h-2 bg-[#011627] rounded-lg appearance-none cursor-pointer"
                             />
                         </div>
                    )}

                     {/* Brush Opacity */}
                     {(tool === 'brush') && (
                         <div>
                             <label className="text-xs text-[#5f7e97] font-bold mb-2 block">Opacity</label>
                             <input 
                                type="range" min="1" max="100" 
                                value={brushOpacity} 
                                onChange={(e) => setBrushOpacity(parseInt(e.target.value))}
                                className="w-full accent-[#7e57c2] h-2 bg-[#011627] rounded-lg appearance-none cursor-pointer"
                             />
                         </div>
                    )}

                    {/* Fill Patterns */}
                    {(tool === 'brush' || tool === 'fill') && (
                        <div>
                             <label className="text-xs text-[#5f7e97] font-bold mb-2 block">Pattern</label>
                             <div className="grid grid-cols-3 gap-2">
                                 {['solid', 'stripes', 'dots', 'grid', 'check'].map((p) => (
                                     <button 
                                        key={p}
                                        onClick={() => setFillPattern(p as PatternType)}
                                        className={`h-10 rounded-lg border-2 flex items-center justify-center text-xs capitalize ${fillPattern === p ? 'border-[#7e57c2] bg-[#011627]' : 'border-[#122d42] text-[#89a4bb] hover:bg-[#011627]'}`}
                                     >
                                         {p}
                                     </button>
                                 ))}
                             </div>
                        </div>
                    )}

                    {/* Textures */}
                    {tool === 'texture' && (
                        <div className="space-y-2">
                            <label className="text-xs text-[#5f7e97] font-bold block">Apply Overlay</label>
                            {['paper', 'watercolor', 'canvas'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => applyTexture(t as TextureType)}
                                    className="w-full py-3 px-4 bg-[#011627] hover:bg-[#234d70] rounded-lg text-left text-sm font-medium text-[#d6deeb] capitalize transition-colors border border-[#122d42]"
                                >
                                    Apply {t} Texture
                                </button>
                            ))}
                        </div>
                    )}
                  </>
              )}
          </div>

          {/* Canvas Area - Background #011627 */}
          <div className="flex-1 bg-[#011627] relative overflow-auto flex items-center justify-center p-8">
               <div className="relative shadow-2xl shadow-black/50">
                   <canvas
                     ref={canvasRef}
                     onMouseDown={startDrawing}
                     onMouseMove={draw}
                     onMouseUp={stopDrawing}
                     onMouseLeave={stopDrawing}
                     onTouchStart={startDrawing}
                     onTouchMove={draw}
                     onTouchEnd={stopDrawing}
                     className="bg-white cursor-crosshair block max-w-full max-h-[80vh]"
                   />
                   
                   {/* Text Input Overlay */}
                   {textInput.visible && (
                       <div 
                        className="absolute p-2 bg-[#0b253a]/95 rounded-xl shadow-xl border border-[#7e57c2] flex flex-col gap-2 z-30 w-64"
                        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                       >
                           <h4 className="text-xs font-bold text-[#d6deeb]">Add Text</h4>
                           <input
                             ref={textInputRef}
                             value={textInput.value}
                             onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                             onKeyDown={(e) => e.key === 'Enter' && commitText()}
                             placeholder="Type here..."
                             className="w-full bg-[#011627] border border-[#5f7e97] rounded p-2 text-[#d6deeb] outline-none"
                           />
                           <div className="flex justify-end gap-2">
                               <button onClick={() => setTextInput({...textInput, visible: false})} className="text-xs text-[#5f7e97] hover:text-[#d6deeb]">Cancel</button>
                               <button onClick={commitText} className="px-3 py-1 bg-[#7e57c2] rounded text-xs font-bold text-white">Add</button>
                           </div>
                       </div>
                   )}
               </div>
          </div>

      </div>
    </div>
  );
};
