export interface GeneratedImage {
  id: string;
  url: string; // Data URL
  prompt: string;
  timestamp: number;
}

export enum AppView {
  GENERATOR = 'GENERATOR',
  EDITOR = 'EDITOR',
}

export type ToolType = 'brush' | 'eraser' | 'fill' | 'text' | 'texture' | 'ai-edit';

export type PatternType = 'solid' | 'stripes' | 'dots' | 'grid' | 'check';

export type TextureType = 'none' | 'paper' | 'canvas' | 'watercolor';

export interface EditorState {
  activeTool: ToolType;
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  fillPattern: PatternType;
  activeTexture: TextureType;
  isDrawing: boolean;
  history: string[]; // Array of data URLs for undo
  historyStep: number;
}