import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { ToolType, DrawingStroke, CanvasTextNote, CanvasSticker } from '../types';
import { renderCanvasSnapshot } from './canvasExport';
import { CanvasNoteItem } from './CanvasNoteItem';
import { CanvasStickerItem } from './CanvasStickerItem';

export interface CanvasHandle {
  exportSnapshot: (overrides?: {
    strokes?: DrawingStroke[];
    stickers?: CanvasSticker[];
    textNotes?: CanvasTextNote[];
  }) => Promise<string>;
  clearCanvas: () => void;
  addStroke: (stroke: DrawingStroke) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  getDimensions?: () => { width: number; height: number };
}

interface CanvasProps {
  currentTool: ToolType;
  brushColor: string;
  brushSize: number;
  textNotes: CanvasTextNote[];
  stickers: CanvasSticker[];
  onUpdateTextNote: (id: string, updates: Partial<CanvasTextNote>) => void;
  onDeleteTextNote: (id: string) => void;
  onUpdateSticker: (id: string, updates: Partial<CanvasSticker>) => void;
  onDeleteSticker: (id: string) => void;
  onStrokeCountChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({
  currentTool,
  brushColor,
  brushSize,
  textNotes,
  stickers,
  onUpdateTextNote,
  onDeleteTextNote,
  onUpdateSticker,
  onDeleteSticker,
  onStrokeCountChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const strokesRef = useRef<DrawingStroke[]>([]);
  strokesRef.current = strokes;

  const textNotesRef = useRef<CanvasTextNote[]>(textNotes);
  textNotesRef.current = textNotes;
  const stickersRef = useRef<CanvasSticker[]>(stickers);
  stickersRef.current = stickers;

  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([]);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawingStroke | null>(null);

  // Dragging state for text notes and stickers with pointer capture
  const [dragItem, setDragItem] = useState<{
    type: 'text' | 'sticker';
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    pointerId?: number;
    target?: HTMLElement;
  } | null>(null);

  // Notify parent of undo/redo status
  useEffect(() => {
    if (onStrokeCountChange) {
      onStrokeCountChange(strokes.length > 0, redoStack.length > 0);
    }
  }, [strokes.length, redoStack.length, onStrokeCountChange]);

  // Handle Resize and Retina display (attaches to window resize without clearing on every stroke)
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      redrawAllStrokes(strokesRef.current);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Redraw all strokes on canvas
  const redrawAllStrokes = (strokesToDraw: DrawingStroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(dpr, dpr);

    strokesToDraw.forEach((stroke) => {
      if (stroke.points.length === 0) return;

      ctx.save();
      ctx.beginPath();

      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else if (stroke.tool === 'marker') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 1.0;
      }

      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const points = stroke.points;
      ctx.moveTo(points[0].x, points[0].y);

      if (points.length === 1) {
        ctx.lineTo(points[0].x + 0.1, points[0].y + 0.1);
      } else {
        for (let i = 1; i < points.length; i++) {
          const xc = (points[i - 1].x + points[i].x) / 2;
          const yc = (points[i - 1].y + points[i].y) / 2;
          ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      }

      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  };

  // Helper to draw single-tap dot immediately to 2D canvas context
  const drawSingleDot = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tool: ToolType,
    color: string,
    size: number,
    dpr: number
  ) => {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else if (tool === 'marker') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1.0;
    }
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    ctx.restore();
  };

  // Pointer event handlers for drawing
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (currentTool === 'text' || currentTool === 'sticker') return;
    
    // Only primary button
    if (e.button !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newStroke: DrawingStroke = {
      id: Math.random().toString(36).substring(2, 9),
      tool: currentTool,
      color: brushColor,
      size: brushSize,
      points: [{ x, y, pressure: e.pressure }],
    };

    currentStrokeRef.current = newStroke;
    isDrawingRef.current = true;
    setRedoStack([]); // Clear redo stack on new stroke

    // Immediately draw single-tap click/dot to 2D canvas context during pointer down
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      drawSingleDot(ctx, x, y, currentTool, brushColor, brushSize, dpr);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentStrokeRef.current.points.push({ x, y, pressure: e.pressure });

    // Draw active stroke chunk incrementally
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.scale(dpr, dpr);

      const stroke = currentStrokeRef.current;
      const pts = stroke.points;
      const len = pts.length;

      if (len > 1) {
        ctx.beginPath();
        if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (stroke.tool === 'marker') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.globalAlpha = 0.35;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.globalAlpha = 1.0;
        }

        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.moveTo(pts[len - 2].x, pts[len - 2].y);
        ctx.lineTo(pts[len - 1].x, pts[len - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }

    const finishedStroke = currentStrokeRef.current;
    // Ensure single-tap dot is explicitly drawn to 2D context during pointer up if single point
    if (finishedStroke.points.length === 1) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const pt = finishedStroke.points[0];
        drawSingleDot(ctx, pt.x, pt.y, finishedStroke.tool, finishedStroke.color, finishedStroke.size, dpr);
      }
    }

    setStrokes((prev) => [...prev, finishedStroke]);
    currentStrokeRef.current = null;
    isDrawingRef.current = false;
  };

  // Imperative handle functions
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (strokes.length === 0) return;
      const last = strokes[strokes.length - 1];
      const remaining = strokes.slice(0, -1);
      setStrokes(remaining);
      setRedoStack((prev) => [last, ...prev]);
      redrawAllStrokes(remaining);
    },
    redo: () => {
      if (redoStack.length === 0) return;
      const next = redoStack[0];
      const remainingRedo = redoStack.slice(1);
      const updatedStrokes = [...strokes, next];
      setStrokes(updatedStrokes);
      setRedoStack(remainingRedo);
      redrawAllStrokes(updatedStrokes);
    },
    clearCanvas: () => {
      strokesRef.current = [];
      setStrokes([]);
      setRedoStack([]);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    },
    addStroke: (stroke: DrawingStroke) => {
      const updated = [...strokesRef.current, stroke];
      strokesRef.current = updated;
      setStrokes(updated);
      setRedoStack([]);
      redrawAllStrokes(updated);
    },
    canUndo: strokes.length > 0,
    canRedo: redoStack.length > 0,
    getDimensions: () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }
      return { width: 390, height: 600 };
    },
    exportSnapshot: (overrides) =>
      renderCanvasSnapshot({
        container: containerRef.current,
        strokes: overrides?.strokes ?? strokesRef.current,
        stickers: overrides?.stickers ?? stickersRef.current,
        textNotes: overrides?.textNotes ?? textNotesRef.current,
      }),
  }));

  const onUpdateTextNoteRef = useRef(onUpdateTextNote);
  onUpdateTextNoteRef.current = onUpdateTextNote;
  const onUpdateStickerRef = useRef(onUpdateSticker);
  onUpdateStickerRef.current = onUpdateSticker;

  // Window listeners for dragging notes & stickers (prevents drag sticking when leaving container)
  useEffect(() => {
    if (!dragItem) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - dragItem.startX;
      const deltaY = e.clientY - dragItem.startY;
      const newX = Math.max(0, dragItem.origX + deltaX);
      const newY = Math.max(0, dragItem.origY + deltaY);

      if (dragItem.type === 'text') {
        onUpdateTextNoteRef.current(dragItem.id, { x: newX, y: newY });
      } else {
        onUpdateStickerRef.current(dragItem.id, { x: newX, y: newY });
      }
    };

    const handleWindowPointerUp = () => {
      if (dragItem.target && dragItem.pointerId !== undefined) {
        try {
          if (dragItem.target.hasPointerCapture(dragItem.pointerId)) {
            dragItem.target.releasePointerCapture(dragItem.pointerId);
          }
        } catch {
          // ignore if already released
        }
      }
      setDragItem(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [dragItem]);

  const handleItemPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    type: 'text' | 'sticker',
    id: string,
    curX: number,
    curY: number
  ) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture unsupported
    }
    setDragItem({
      type,
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: curX,
      origY: curY,
      pointerId: e.pointerId,
      target: e.currentTarget,
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex-grow overflow-hidden bg-butter select-none cursor-crosshair touch-none"
      style={{
        backgroundImage: 'radial-gradient(#d6d3d1 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        touchAction: 'none', // MANDATORY MOBILE UX CONSTRAINT
      }}
    >
      {/* HTML5 Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute inset-0 block w-full h-full touch-none"
        style={{ touchAction: 'none' }}
      />

      {/* Draggable Text Notes Layer */}
      {textNotes.map((note) => (
        <CanvasNoteItem
          key={note.id}
          note={note}
          onPointerDown={(e, n) => handleItemPointerDown(e, 'text', n.id, n.x, n.y)}
          onDelete={onDeleteTextNote}
        />
      ))}

      {/* Draggable Stickers / Dropped Photos Layer */}
      {stickers.map((sticker) => (
        <CanvasStickerItem
          key={sticker.id}
          sticker={sticker}
          onPointerDown={(e, s) => handleItemPointerDown(e, 'sticker', s.id, s.x, s.y)}
          onUpdate={onUpdateSticker}
          onDelete={onDeleteSticker}
        />
      ))}

    </div>
  );
});

Canvas.displayName = 'Canvas';
