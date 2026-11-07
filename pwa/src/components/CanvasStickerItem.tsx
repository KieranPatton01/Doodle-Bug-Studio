import React, { useState, useRef } from 'react';
import { Trash2, ImageOff, RotateCw, RotateCcw } from 'lucide-react';
import { CanvasSticker } from '../types';
import { resolveLocalPhotoPreview } from '../services/storageService';

interface CanvasStickerItemProps {
  sticker: CanvasSticker;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, sticker: CanvasSticker) => void;
  onUpdate: (id: string, updates: Partial<CanvasSticker>) => void;
  onDelete: (id: string) => void;
}

export const CanvasStickerItem: React.FC<CanvasStickerItemProps> = ({
  sticker,
  onPointerDown,
  onUpdate,
  onDelete,
}) => {
  const [loadError, setLoadError] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  // Drag-to-rotate handle handler
  const handleRotatePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const dx = moveEvt.clientX - centerX;
      const dy = moveEvt.clientY - centerY;
      // Angle in degrees from top (0 deg is top)
      let deg = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      // Snap to 0 if within 4 degrees
      if (Math.abs(deg) <= 4) deg = 0;
      onUpdate(sticker.id, { rotation: deg });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const isFrameless =
    sticker.kind === 'sticker' || sticker.kind === 'washi';

  const scaleSticker = (deltaWidth: number) => {
    const ratio = sticker.height / Math.max(1, sticker.width);
    const minW = sticker.kind === 'washi' ? 90 : sticker.kind === 'sticker' ? 60 : 90;
    const maxW = 240;
    const newW = Math.min(maxW, Math.max(minW, sticker.width + deltaWidth));
    const newH = Math.max(24, Math.round(newW * ratio));
    onUpdate(sticker.id, { width: newW, height: newH });
  };

  return (
    <div
      ref={itemRef}
      onPointerDown={(e) => onPointerDown(e, sticker)}
      style={{
        left: `${sticker.x}px`,
        top: `${sticker.y}px`,
        width: `${sticker.width}px`,
        transform: `rotate(${sticker.rotation}deg)`,
      }}
      className={`absolute z-10 group cursor-move select-none transition-transform active:scale-105 touch-none ${
        isFrameless
          ? 'p-1 rounded-2xl bg-transparent hover:bg-white/60 border border-transparent hover:border-stone-200/80'
          : 'p-1.5 bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Top Rotation Handle */}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
        <button
          type="button"
          onPointerDown={handleRotatePointerDown}
          onClick={(e) => {
            e.stopPropagation();
            const nextRot = Math.round((sticker.rotation + 15) % 360);
            onUpdate(sticker.id, { rotation: nextRot });
          }}
          className="w-6 h-6 rounded-full bg-white border border-stone-300 shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-stone-50 active:bg-stone-100 cursor-grab active:cursor-grabbing transition-transform"
          title="Drag or tap to rotate"
        >
          <RotateCw className="w-3 h-3" />
        </button>
        <div className="w-0.5 h-1.5 bg-stone-300"></div>
      </div>

      <div
        style={isFrameless ? { height: `${sticker.height}px` } : undefined}
        className={
          isFrameless
            ? 'relative w-full flex items-center justify-center overflow-visible'
            : 'relative aspect-square rounded-xl overflow-hidden bg-stone-100 flex items-center justify-center'
        }
      >
        {loadError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-pink-50 text-pink-400 p-2 text-center select-none rounded-xl">
            <ImageOff className="w-6 h-6 mb-1 text-pink-300" />
            <span className="text-[10px] font-semibold">{sticker.label || 'Photo'}</span>
          </div>
        ) : (
          <img
            src={resolveLocalPhotoPreview(sticker.url)}
            alt={sticker.label || 'Canvas sticker'}
            className={`w-full h-full pointer-events-none ${
              isFrameless ? 'object-contain drop-shadow-xs' : 'object-cover'
            }`}
            crossOrigin="anonymous"
            onError={() => setLoadError(true)}
          />
        )}
      </div>

      {/* Controls Bar: Size, Rotation & Delete */}
      <div className="mt-1 flex items-center justify-between px-1 py-0.5 gap-1 min-w-max left-1/2 -translate-x-1/2 relative rounded-lg bg-white/90 backdrop-blur-xs">
        {/* Resize Controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              scaleSticker(-25);
            }}
            className="w-4 h-4 rounded bg-stone-100 hover:bg-stone-200 text-slate-700 text-[10px] font-bold flex items-center justify-center transition-colors"
            title="Shrink item"
          >
            -
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              scaleSticker(25);
            }}
            className="w-4 h-4 rounded bg-stone-100 hover:bg-stone-200 text-slate-700 text-[10px] font-bold flex items-center justify-center transition-colors"
            title="Enlarge item"
          >
            +
          </button>
        </div>

        {/* Rotation Controls: Rotate left, Rotate right, Reset */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              let nextRot = Math.round((sticker.rotation - 15) % 360);
              if (nextRot < -180) nextRot += 360;
              onUpdate(sticker.id, { rotation: nextRot });
            }}
            className="w-4 h-4 rounded bg-stone-100 hover:bg-stone-200 text-slate-700 flex items-center justify-center transition-colors"
            title="Rotate -15°"
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              let nextRot = Math.round((sticker.rotation + 15) % 360);
              if (nextRot > 180) nextRot -= 360;
              onUpdate(sticker.id, { rotation: nextRot });
            }}
            className="w-4 h-4 rounded bg-stone-100 hover:bg-stone-200 text-slate-700 flex items-center justify-center transition-colors"
            title="Rotate +15°"
          >
            <RotateCw className="w-2.5 h-2.5" />
          </button>
          {sticker.rotation !== 0 && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(sticker.id, { rotation: 0 });
              }}
              className="px-1 h-4 rounded bg-pink-100 hover:bg-pink-200 text-pink-700 text-[9px] font-bold flex items-center justify-center transition-colors"
              title="Reset rotation to 0°"
            >
              {sticker.rotation}°
            </button>
          )}
        </div>

        {/* Delete Control */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(sticker.id);
          }}
          className="p-0.5 text-rose-500 hover:text-rose-700"
          title="Delete photo"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
