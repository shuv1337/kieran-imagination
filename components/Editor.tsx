import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    Download, Undo, Redo, Eraser, Pen, Sparkles,
    ChevronLeft, PaintBucket, Type as TypeIcon,
    Grid3X3, Palette, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
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
    const [texture, setTexture] = useState<TextureType>('none'); // Keep for logic, though UI might change
    
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
            for (let i = 0; i < canvas.width; i += 2) {
                for (let j = 0; j < canvas.height; j += 2) {
                    if (Math.random() > 0.5) {
                        ctx.fillStyle = '#ccc';
                        ctx.fillRect(i, j, 1, 1);
                    }
                }
            }
        } else if (type === 'watercolor') {
            // Large faint blobs
            ctx.globalAlpha = 0.1;
            for (let k = 0; k < 50; k++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const r = Math.random() * 100 + 50;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = '#ddd';
                ctx.fill();
            }
        }

        ctx.restore();
        saveToHistory();
        setTexture(type); // Update state for UI if needed
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
            return [data[i], data[i + 1], data[i + 2], data[i + 3]];
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
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = a;

                stack.push([x + 1, y]);
                stack.push([x - 1, y]);
                stack.push([x, y + 1]);
                stack.push([x, y - 1]);
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
        if (tool === 'texture') return; 

        setIsDrawing(true);
        draw(e);
    };

    const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
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
                const res = await aiUpscaleImage(current);
                result = res.previewUrl || res.url;
            } else {
                if (!aiPrompt) return;
                const res = await aiEditImage(current, aiPrompt);
                result = res.previewUrl || res.url;
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
            const message = e instanceof Error ? e.message : "AI Magic failed. Please try again.";
            alert(message);
        }
    };

    // --- Render ---

    const colors = ['#000000', '#FFFFFF', '#EF5350', '#22da6e', '#82AAFF', '#c5e478', '#C792EA', '#f6bbe5', '#5f7e97'];

    return (
        <div className="flex flex-col h-full bg-[#0f172a] text-slate-100 relative overflow-hidden">
            
            {/* Top Bar */}
            <header className="h-16 bg-slate-900/80 backdrop-blur border-b border-slate-700 flex items-center justify-between px-6 z-30">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft size={24} /> 
                    <span className="font-comic text-xl">Back</span>
                </button>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-slate-800 rounded-full p-1 border border-slate-700">
                        <button onClick={() => loadFromHistory(historyStep - 1)} disabled={historyStep <= 0} className="p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
                            <Undo size={20} />
                        </button>
                        <div className="w-px h-4 bg-slate-700"></div>
                        <button onClick={() => loadFromHistory(historyStep + 1)} disabled={historyStep >= history.length - 1} className="p-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
                            <Redo size={20} />
                        </button>
                    </div>

                    <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            const dataUrl = canvasRef.current?.toDataURL('image/png');
                            if (!dataUrl) return;
                            
                            // Convert data URL to blob for reliable download
                            const byteString = atob(dataUrl.split(',')[1]);
                            const mimeType = 'image/png';
                            const ab = new ArrayBuffer(byteString.length);
                            const ia = new Uint8Array(ab);
                            for (let i = 0; i < byteString.length; i++) {
                                ia[i] = byteString.charCodeAt(i);
                            }
                            const blob = new Blob([ab], { type: mimeType });
                            const blobUrl = URL.createObjectURL(blob);
                            
                            const link = document.createElement('a');
                            link.download = fileName || 'kierans-art.png';
                            link.href = blobUrl;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                        }} 
                        className="bg-green-500 hover:bg-green-400 text-white px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg shadow-green-500/20"
                    >
                        <Save size={18} /> Save Art
                    </motion.button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                
                {/* Left Toolbar (Tools) */}
                <div className="w-24 bg-slate-900/90 backdrop-blur border-r border-slate-700 flex flex-col items-center py-6 gap-4 z-20 overflow-y-auto no-scrollbar">
                     {[
                        { t: 'brush', i: <Pen size={24} />, l: 'Brush' },
                        { t: 'eraser', i: <Eraser size={24} />, l: 'Eraser' },
                        { t: 'fill', i: <PaintBucket size={24} />, l: 'Fill' },
                        { t: 'text', i: <TypeIcon size={24} />, l: 'Text' },
                        { t: 'texture', i: <Grid3X3 size={24} />, l: 'Texture' },
                        { t: 'ai-edit', i: <Sparkles size={24} />, l: 'AI Magic' },
                    ].map((item) => (
                        <motion.button
                            key={item.t}
                            whileHover={{ scale: 1.1, x: 5 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setTool(item.t as ToolType)}
                            className={clsx(
                                "w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative group",
                                tool === item.t 
                                    ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/40" 
                                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                            )}
                            title={item.l}
                        >
                            {item.i}
                            <span className="text-[10px] font-bold">{item.l}</span>
                        </motion.button>
                    ))}
                </div>

                {/* Middle - Canvas Area */}
                <div className="flex-1 bg-[#1e293b] relative overflow-auto flex items-center justify-center p-10 shadow-inner">
                    
                    {/* Canvas Container with "Desk" feel */}
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-sm bg-white"
                    >
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="cursor-crosshair block touch-none"
                            style={{ maxWidth: '100%', maxHeight: '75vh' }}
                        />

                        {/* Text Input Overlay */}
                        {textInput.visible && (
                            <div
                                className="absolute p-3 bg-slate-800 rounded-xl shadow-2xl border border-purple-500 flex flex-col gap-2 z-30 w-64"
                                style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                            >
                                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                                    <TypeIcon size={14} className="text-purple-400" /> Add Text
                                </h4>
                                <input
                                    ref={textInputRef}
                                    value={textInput.value}
                                    onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                                    onKeyDown={(e) => e.key === 'Enter' && commitText()}
                                    placeholder="Type something..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-purple-500 transition-colors"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setTextInput({ ...textInput, visible: false })} className="px-3 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                                    <button onClick={commitText} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-bold text-white">Add</button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Right Panel (Settings) */}
                <div className="w-72 bg-slate-900/95 backdrop-blur border-l border-slate-700 p-6 flex flex-col gap-6 z-20 overflow-y-auto">
                    
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                         <Palette size={18} />
                         <span className="text-xs font-bold uppercase tracking-wider">
                             {tool === 'ai-edit' ? 'Magic Settings' : 'Tool Options'}
                         </span>
                    </div>

                    {tool === 'ai-edit' ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-purple-400">AI Edit</label>
                                <p className="text-xs text-slate-500 mb-2">Describe what to change in the drawing.</p>
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="E.g., Add a party hat to the dog..."
                                    className="w-full bg-slate-800 border-slate-700 rounded-xl p-3 text-sm text-white h-24 resize-none focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                />
                                <button
                                    onClick={() => handleAiAction('edit')}
                                    disabled={isProcessing || !aiPrompt}
                                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                                >
                                    {isProcessing ? <Sparkles className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                    {isProcessing ? 'Magic in progress...' : 'Apply Magic'}
                                </button>
                            </div>
                            
                            <div className="border-t border-slate-800 pt-6 space-y-2">
                                <label className="text-sm font-bold text-pink-400">Upscale</label>
                                <p className="text-xs text-slate-500 mb-2">Make lines sharper and clearer.</p>
                                <button
                                    onClick={() => handleAiAction('upscale')}
                                    disabled={isProcessing}
                                    className="w-full bg-pink-600 hover:bg-pink-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-3 rounded-xl font-bold text-sm transition-colors"
                                >
                                    Upscale Quality
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            
                            {/* Color Picker */}
                            {(tool === 'brush' || tool === 'fill' || tool === 'text') && (
                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-slate-300">Color</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {colors.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setColor(c)}
                                                style={{ backgroundColor: c }}
                                                className={clsx(
                                                    "w-8 h-8 rounded-full border-2 transition-all hover:scale-110 shadow-sm",
                                                    color === c ? "border-white scale-110 ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900" : "border-slate-600"
                                                )}
                                            />
                                        ))}
                                        <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-slate-600 hover:border-white transition-colors">
                                             <input
                                                type="color"
                                                value={color}
                                                onChange={(e) => setColor(e.target.value)}
                                                className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Size Slider */}
                            {(tool === 'brush' || tool === 'eraser' || tool === 'text') && (
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-sm font-bold text-slate-300">{tool === 'text' ? 'Font Size' : 'Size'}</label>
                                        <span className="text-xs text-slate-500">{brushSize}px</span>
                                    </div>
                                    <input
                                        type="range" min="1" max="100"
                                        value={brushSize}
                                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                </div>
                            )}
                            
                             {/* Opacity Slider */}
                            {(tool === 'brush') && (
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-sm font-bold text-slate-300">Opacity</label>
                                        <span className="text-xs text-slate-500">{brushOpacity}%</span>
                                    </div>
                                    <input
                                        type="range" min="1" max="100"
                                        value={brushOpacity}
                                        onChange={(e) => setBrushOpacity(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                </div>
                            )}

                            {/* Patterns */}
                            {(tool === 'brush' || tool === 'fill') && (
                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-slate-300">Pattern</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['solid', 'stripes', 'dots', 'grid', 'check'].map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setFillPattern(p as PatternType)}
                                                className={clsx(
                                                    "h-10 rounded-lg border flex items-center justify-center text-xs capitalize transition-all",
                                                    fillPattern === p 
                                                        ? "border-blue-500 bg-blue-500/20 text-blue-300" 
                                                        : "border-slate-700 text-slate-400 hover:bg-slate-800"
                                                )}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                             {/* Texture Overlay */}
                             {tool === 'texture' && (
                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-slate-300">Overlays</label>
                                    <div className="flex flex-col gap-2">
                                        {['paper', 'watercolor'].map(t => (
                                            <button
                                                key={t}
                                                onClick={() => applyTexture(t as TextureType)}
                                                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-left text-sm font-medium text-slate-200 capitalize transition-all border border-slate-700 hover:border-slate-500"
                                            >
                                                Apply {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
