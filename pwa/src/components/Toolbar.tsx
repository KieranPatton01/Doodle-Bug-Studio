import React from 'react';
import { 
  Paintbrush, 
  Eraser, 
  Highlighter, 
  Type, 
  Image as ImageIcon, 
  Sparkles,
  RotateCcw, 
  RotateCw, 
  Trash2 
} from 'lucide-react';
import { ToolType, StickerTrayTab } from '../types';

interface ToolbarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  brushColor: string;
  brushSize: number;
  onOpenColorPicker: () => void;
  onOpenBrushPicker: () => void;
  onOpenTextModal: () => void;
  onOpenStickerTray: (tab?: StickerTrayTab) => void;
  onOpenNerdAssist?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  brushColor,
  brushSize,
  onOpenColorPicker,
  onOpenBrushPicker,
  onOpenTextModal,
  onOpenStickerTray,
  onOpenNerdAssist,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 p-2 sm:p-3 pointer-events-none flex justify-center">
      <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-stone-300 shadow-retro rounded-3xl p-1.5 sm:p-2 flex items-center gap-1 sm:gap-1.5 max-w-full overflow-x-auto scrollbar-none">
        
        {/* Brush Tool */}
        <button
          onClick={() => {
            if (currentTool === 'brush') {
              onOpenBrushPicker();
            } else {
              onSelectTool('brush');
            }
          }}
          className={`relative p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-center transition-all transform active:scale-90 ${
            currentTool === 'brush'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100'
          }`}
          title={`Paintbrush (${brushSize}px - tap again to change size)`}
        >
          <Paintbrush className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Pen</span>
        </button>

        {/* Marker Tool */}
        <button
          onClick={() => onSelectTool('marker')}
          className={`p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-center transition-all transform active:scale-90 ${
            currentTool === 'marker'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100'
          }`}
          title="Highlighter / Marker"
        >
          <Highlighter className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Mark</span>
        </button>

        {/* Eraser Tool */}
        <button
          onClick={() => onSelectTool('eraser')}
          className={`p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-center transition-all transform active:scale-90 ${
            currentTool === 'eraser'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-stone-100'
          }`}
          title="Eraser"
        >
          <Eraser className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Erase</span>
        </button>

        {/* Color Indicator / Picker */}
        <button
          onClick={onOpenColorPicker}
          className="p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-center hover:bg-stone-100 transition-all transform active:scale-90"
          title="Color Palette"
        >
          <div
            className="w-5 h-5 rounded-full border-2 border-slate-900 shadow-xs"
            style={{ backgroundColor: brushColor }}
          />
          <span className="text-[10px] font-semibold mt-0.5 text-slate-700">Color</span>
        </button>

        <div className="w-[1px] h-8 bg-stone-200 mx-0.5" />

        {/* Add Text Note */}
        <button
          onClick={onOpenTextModal}
          className="p-2 sm:p-2.5 rounded-2xl text-slate-700 hover:bg-stone-100 flex flex-col items-center justify-center transition-all transform active:scale-90"
          title="Add Handwritten Text Note"
        >
          <Type className="w-5 h-5 text-amber-700" />
          <span className="text-[10px] font-semibold mt-0.5">Note</span>
        </button>

        {/* Photo & GIF Browser */}
        <button
          onClick={() => onOpenStickerTray('gifs')}
          className="p-2 sm:p-2.5 rounded-2xl text-slate-700 hover:bg-stone-100 flex flex-col items-center justify-center transition-all transform active:scale-90"
          title="Upload Photos or Search Cute GIFs"
        >
          <ImageIcon className="w-5 h-5 text-pink-600" />
          <span className="text-[10px] font-semibold mt-0.5">GIF/Pic</span>
        </button>

        {/* Aesthetic Sticker & Washi Tape Tray */}
        <button
          onClick={() => onOpenStickerTray('stickers')}
          className="p-2 sm:p-2.5 rounded-2xl text-slate-700 hover:bg-stone-100 flex flex-col items-center justify-center transition-all transform active:scale-90"
          title="Aesthetic Sticker & Washi Tape Tray"
        >
          <Sparkles className="w-5 h-5 text-rose-500" />
          <span className="text-[10px] font-semibold mt-0.5">Stickers</span>
        </button>

        {/* Nerd Assist Button */}
        {onOpenNerdAssist && (
          <button
            onClick={onOpenNerdAssist}
            className="p-2 sm:p-2.5 rounded-2xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-slate-800 flex flex-col items-center justify-center transition-all transform active:scale-90"
            title="Nerd Assist — Let your nerd doodle & build a webpage from a prompt!"
          >
            <span className="text-base leading-none">🤓</span>
            <span className="text-[10px] font-bold mt-0.5 text-pink-700">Nerd</span>
          </button>
        )}

        <div className="w-[1px] h-8 bg-stone-200 mx-0.5" />

        {/* Undo Button */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2.5 sm:p-3 rounded-2xl flex flex-col items-center justify-center transition-all ${
            canUndo
              ? 'text-slate-700 hover:bg-stone-100 active:scale-90'
              : 'text-stone-300 cursor-not-allowed'
          }`}
          title="Undo"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Undo</span>
        </button>

        {/* Redo Button */}
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2.5 sm:p-3 rounded-2xl flex flex-col items-center justify-center transition-all ${
            canRedo
              ? 'text-slate-700 hover:bg-stone-100 active:scale-90'
              : 'text-stone-300 cursor-not-allowed'
          }`}
          title="Redo"
        >
          <RotateCw className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Redo</span>
        </button>

        {/* Clear Canvas */}
        <button
          onClick={() => {
            if (window.confirm('Clear your entire doodle canvas?')) {
              onClear();
            }
          }}
          className="p-2.5 sm:p-3 rounded-2xl text-rose-600 hover:bg-rose-50 flex flex-col items-center justify-center transition-all active:scale-90"
          title="Clear Canvas"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Clear</span>
        </button>

      </div>
    </nav>
  );
};
