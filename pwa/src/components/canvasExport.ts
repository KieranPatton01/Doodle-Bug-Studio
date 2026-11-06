import { DrawingStroke, CanvasSticker, CanvasTextNote } from '../types';

export interface CanvasExportParams {
  container: HTMLDivElement | null;
  strokes: DrawingStroke[];
  stickers: CanvasSticker[];
  textNotes: CanvasTextNote[];
}

/**
 * Renders the full canvas stage (paper, dot grid, strokes, stickers, and notes)
 * to a high-resolution PNG data URL for Gemini Flash multimodal inference.
 */
export async function renderCanvasSnapshot({
  container,
  strokes,
  stickers,
  textNotes,
}: CanvasExportParams): Promise<string> {
  if (!container) return '';

  // Wait for Google Fonts to be ready for exact text measurement & rendering
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font loading errors; fall back to system font metrics
    }
  }

  const rect = container.getBoundingClientRect();
  const exportCanvas = document.createElement('canvas');
  const dpr = 2; // High-res export for Gemini Flash
  exportCanvas.width = rect.width * dpr;
  exportCanvas.height = rect.height * dpr;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return '';

  // Preload external images concurrently with timeout to prevent hanging on stalled connections
  const loadedImages = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    stickers.map(async (sticker) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const ok = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 5000);
          img.onload = () => {
            clearTimeout(timer);
            resolve(true);
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
          img.src = sticker.url;
        });
        loadedImages.set(sticker.id, ok && img.naturalWidth > 0 ? img : null);
      } catch {
        loadedImages.set(sticker.id, null);
      }
    })
  );

  const drawAll = (drawRealImages: boolean) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.scale(dpr, dpr);

    // 1. Draw warm paper canvas background
    ctx.fillStyle = '#FFFDF5';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 2. Draw subtle dot grid pattern
    ctx.fillStyle = '#E7E5E4';
    for (let x = 12; x < rect.width; x += 24) {
      for (let y = 12; y < rect.height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Draw drawing strokes onto a transparent offscreen buffer so eraser clears strokes without wiping dot grid
    const strokesCanvas = document.createElement('canvas');
    strokesCanvas.width = exportCanvas.width;
    strokesCanvas.height = exportCanvas.height;
    const strokesCtx = strokesCanvas.getContext('2d');
    if (strokesCtx) {
      strokesCtx.scale(dpr, dpr);
      strokes.forEach((stroke) => {
        if (stroke.points.length === 0) return;
        strokesCtx.save();
        strokesCtx.beginPath();

        if (stroke.tool === 'eraser') {
          strokesCtx.globalCompositeOperation = 'destination-out';
          strokesCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (stroke.tool === 'marker') {
          strokesCtx.globalCompositeOperation = 'source-over';
          strokesCtx.strokeStyle = stroke.color;
          strokesCtx.globalAlpha = 0.35;
        } else {
          strokesCtx.globalCompositeOperation = 'source-over';
          strokesCtx.strokeStyle = stroke.color;
          strokesCtx.globalAlpha = 1.0;
        }

        strokesCtx.lineWidth = stroke.size;
        strokesCtx.lineCap = 'round';
        strokesCtx.lineJoin = 'round';

        const pts = stroke.points;
        strokesCtx.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 1) {
          strokesCtx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
        } else {
          for (let i = 1; i < pts.length; i++) {
            const xc = (pts[i - 1].x + pts[i].x) / 2;
            const yc = (pts[i - 1].y + pts[i].y) / 2;
            strokesCtx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc);
          }
          strokesCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        }
        strokesCtx.stroke();
        strokesCtx.restore();
      });
      ctx.drawImage(strokesCanvas, 0, 0, rect.width, rect.height);
    }

    // 4. Draw dropped photo stickers, GIFs, aesthetic stickers, and washi tapes onto export canvas
    for (const sticker of stickers) {
      ctx.save();
      ctx.translate(sticker.x + sticker.width / 2, sticker.y + sticker.height / 2);
      ctx.rotate((sticker.rotation * Math.PI) / 180);

      const isFrameless =
        sticker.kind === 'sticker' || sticker.kind === 'washi';

      if (!isFrameless) {
        // White polaroid-style frame for photos and GIFs
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 8;
        ctx.fillRect(-sticker.width / 2 - 4, -sticker.height / 2 - 4, sticker.width + 8, sticker.height + 24);
      }

      const img = loadedImages.get(sticker.id);
      if ((drawRealImages || sticker.url.startsWith('data:image/')) && img) {
        try {
          ctx.drawImage(img, -sticker.width / 2, -sticker.height / 2, sticker.width, sticker.height);
        } catch {
          ctx.fillStyle = '#FCE7F3';
          ctx.fillRect(-sticker.width / 2, -sticker.height / 2, sticker.width, sticker.height);
        }
      } else {
        ctx.fillStyle = '#FCE7F3';
        ctx.fillRect(-sticker.width / 2, -sticker.height / 2, sticker.width, sticker.height);
        ctx.fillStyle = '#DB2777';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(sticker.label || '📷 Photo', 0, 0);
      }
      ctx.restore();
    }

    // 5. Draw text notes onto export canvas (multi-line supported, exact screen alignment)
    for (const note of textNotes) {
      ctx.save();
      const fontStack = note.fontFamily === 'Caveat' ? 'Caveat, cursive' : 'Plus Jakarta Sans, sans-serif';
      ctx.font = `bold ${note.fontSize}px ${fontStack}`;
      ctx.textBaseline = 'top';

      const lines = note.text.split('\n');
      const lineHeight = Math.round(note.fontSize * 1.35);

      let maxLineWidth = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxLineWidth) maxLineWidth = w;
      }

      const padX = 12; // px-3
      const padY = 6;  // p-1.5
      const iconSpace = 18; // icon + gap
      const deleteBtnSpace = 22; // ml-1.5 + trash icon (w-3 h-3) + button padding
      const boxWidth = Math.max(60, maxLineWidth + padX * 2 + iconSpace + deleteBtnSpace);
      const boxHeight = lines.length * lineHeight + padY * 2;

      // Note container background
      ctx.fillStyle = 'rgba(254, 243, 199, 0.92)';
      ctx.strokeStyle = 'rgba(252, 211, 77, 0.85)';
      ctx.lineWidth = 1;

      if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
        ctx.beginPath();
        (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(note.x, note.y, boxWidth, boxHeight, 12);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(note.x, note.y, boxWidth, boxHeight);
        ctx.strokeRect(note.x, note.y, boxWidth, boxHeight);
      }

      // Render each line of text
      ctx.fillStyle = note.color;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], note.x + padX + iconSpace, note.y + padY + i * lineHeight);
      }

      ctx.restore();
    }

    ctx.restore();
  };

  try {
    drawAll(true);
    return exportCanvas.toDataURL('image/png');
  } catch (taintErr) {
    console.warn('Canvas export tainted by external photo CORS; re-exporting with polaroid placeholders to preserve notes and strokes.', taintErr);
    drawAll(false);
    return exportCanvas.toDataURL('image/png');
  }
}
