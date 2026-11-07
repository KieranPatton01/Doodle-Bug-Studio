import React, { useState } from 'react';
import { X, Wand2, Sparkles, Loader2 } from 'lucide-react';
import { DrawingStroke, CanvasTextNote, CanvasSticker } from '../types';
import { PASTEL_WASHI_TAPES, AESTHETIC_STICKERS, CURATED_GIFS } from './StickerTrayModal';
import { AssistApiResponse } from '../services/workerClient';

export interface NerdAssistPlan {
  strokes: DrawingStroke[];
  notes: Omit<CanvasTextNote, 'id'>[];
  stickers: Omit<CanvasSticker, 'id'>[];
}

interface NerdAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunAssist: (prompt: string) => void;
  isAssisting: boolean;
}

const QUICK_IDEAS = [
  {
    label: '💌 Sweet Love Note',
    prompt: 'Make a romantic love note scrapbook page with pink hearts, bows, cute cat GIF, and sweet notes for my favourite person!',
  },
  {
    label: '☕ Cozy Matcha & Cafe',
    prompt: 'Create a cozy cafe diary layout with iced matcha, warm latte, croissant stickers, matcha grid washi tape, and weekend coffee date notes!',
  },
  {
    label: '🎂 Birthday Party Vibe',
    prompt: 'Design a super cute birthday celebration page with sparkles, stars, excited happy cat GIF, pastel pink washi tape, and party wishes!',
  },
  {
    label: '🐱 Kawaii Kitty Club',
    prompt: 'Make an adorable cat lover page with kawaii kitty stickers, paw prints, cute cat hug GIF, and playful cat notes!',
  },
];

// Helper to generate smooth hand-drawn points for a heart
function createHeartPoints(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = cx + size * (16 * Math.pow(Math.sin(t), 3)) / 16;
    const y = cy - size * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
    pts.push({ x: Math.round(x), y: Math.round(y) });
  }
  return pts;
}

// Helper to generate a hand-drawn rounded frame
function createFramePoints(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  return [
    { x, y },
    { x: x + w * 0.5, y: y - 2 },
    { x: x + w, y },
    { x: x + w + 2, y: y + h * 0.5 },
    { x: x + w, y: y + h },
    { x: x + w * 0.5, y: y + h + 2 },
    { x, y: y + h },
    { x: x - 2, y: y + h * 0.5 },
    { x, y },
  ];
}

// Helper to generate a cute wavy divider line
function createWavePoints(startX: number, endX: number, y: number, amplitude = 6, waves = 6): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const x = startX + (endX - startX) * ratio;
    const offset = Math.sin(ratio * Math.PI * 2 * waves) * amplitude;
    pts.push({ x: Math.round(x), y: Math.round(y + offset) });
  }
  return pts;
}

// Helper to generate a cute 5-point star doodle
function createStarPoints(cx: number, cy: number, outerR: number, innerR: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({
      x: Math.round(cx + Math.cos(angle) * r),
      y: Math.round(cy + Math.sin(angle) * r),
    });
  }
  return pts;
}

/**
 * Resolves an AI-returned AssistApiResponse into real Doodlebug Canvas items
 */
export function resolveAiAssistPlan(
  aiResponse: AssistApiResponse,
  dims: { width: number; height: number }
): NerdAssistPlan {
  const w = Math.max(320, Math.min(dims.width || 390, 430));
  const h = Math.max(480, Math.min(dims.height || 600, 720));

  const strokes: DrawingStroke[] = (aiResponse.strokes || [])
    .filter((s) => Array.isArray(s.points) && s.points.length >= 2)
    .map((s, idx) => ({
      id: `ai-stroke-${idx}-${Date.now()}`,
      tool: s.tool === 'marker' ? 'marker' : 'brush',
      color: s.color || '#0f172a',
      size: typeof s.size === 'number' ? Math.max(2, Math.min(28, s.size)) : 5,
      points: s.points.map((pt) => ({
        x: Math.max(6, Math.min(w - 6, Math.round(pt.x))),
        y: Math.max(6, Math.min(h - 6, Math.round(pt.y))),
      })),
    }));

  const notes: Omit<CanvasTextNote, 'id'>[] = (aiResponse.notes || [])
    .filter((n) => typeof n.text === 'string' && n.text.trim().length > 0)
    .map((n) => ({
      text: n.text.trim(),
      x: Math.max(16, Math.min(w - 150, Math.round(n.x || 60))),
      y: Math.max(36, Math.min(h - 90, Math.round(n.y || 100))),
      color: n.color || '#0f172a',
      fontSize: typeof n.fontSize === 'number' ? Math.max(12, Math.min(22, n.fontSize)) : 16,
      fontFamily: 'Caveat',
    }));

  const stickers: Omit<CanvasSticker, 'id'>[] = [];
  for (const item of aiResponse.stickers || []) {
    const id = (item.assetId || '').trim();
    const x = Math.max(10, Math.min(w - 90, Math.round(item.x || 100)));
    const y = Math.max(10, Math.min(h - 80, Math.round(item.y || 120)));

    const washiMatch = PASTEL_WASHI_TAPES.find((t) => t.id.toLowerCase() === id.toLowerCase());
    if (washiMatch) {
      stickers.push({
        url: washiMatch.url,
        x: Math.max(10, Math.min(w - washiMatch.width - 10, x)),
        y,
        width: washiMatch.width,
        height: washiMatch.height,
        rotation: 0,
        kind: 'washi',
        label: `${washiMatch.emoji} ${washiMatch.name} Washi Tape`,
      });
      continue;
    }

    const stickerMatch = AESTHETIC_STICKERS.find((s) => s.id.toLowerCase() === id.toLowerCase());
    if (stickerMatch) {
      stickers.push({
        url: stickerMatch.url,
        x,
        y,
        width: 82,
        height: 82,
        rotation: 0,
        kind: 'sticker',
        label: `${stickerMatch.emoji} ${stickerMatch.name}`,
      });
      continue;
    }

    const gifMatch = CURATED_GIFS.find((g) => g.id.toLowerCase() === id.toLowerCase());
    if (gifMatch) {
      stickers.push({
        url: gifMatch.url,
        x: Math.max(16, Math.min(w - 146, x)),
        y,
        width: 132,
        height: 132,
        rotation: 0,
        kind: 'gif',
        label: gifMatch.title,
      });
    }
  }

  return { strokes, notes, stickers };
}

/**
 * Smart local fallback choreographer (used if offline or if /api/assist isn't deployed yet).
 * Never pastes the user's raw prompt onto a sticky note!
 */
export function buildNerdAssistPlan(prompt: string, dims: { width: number; height: number }): NerdAssistPlan {
  const q = prompt.toLowerCase();
  const w = Math.max(320, Math.min(dims.width || 390, 430));
  const h = Math.max(480, Math.min(dims.height || 600, 720));

  const isTeasingOrRagebait = /ragebait|stinky|smelly|roast|teas|annoy|prank|goofy|funny|silly|fart|poop|ugly|loser|nerd/.test(q);
  const isCafe = /coffee|matcha|cafe|tea|latte|croissant|date|cozy|morning/.test(q);
  const isParty = /birthday|party|celebrat|yay|congrat|happy|star|sparkle|invite/.test(q);
  const isCat = /cat|kitty|kitten|paw|meow|pet/.test(q);

  // Pick theme colors from ColorPickerModal palette
  const primaryColor = isTeasingOrRagebait
    ? '#facc15' // Warning yellow
    : isCafe
    ? '#34d399' // Minty matcha
    : isParty
    ? '#a78bfa' // Pastel purple
    : '#f472b6'; // Pastel romance pink

  const accentColor = isTeasingOrRagebait
    ? '#34d399' // Funny green stink-wave accent
    : isCafe
    ? '#78350f' // Espresso brown
    : isParty
    ? '#facc15' // Sunny gold
    : '#fda4af'; // Soft rose

  const noteInkColor = '#0f172a';

  // Pick Washi Tape from PASTEL_WASHI_TAPES
  const topWashi = isTeasingOrRagebait
    ? PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-butter-daisy') || PASTEL_WASHI_TAPES[3]
    : isCafe
    ? PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-matcha-grid') || PASTEL_WASHI_TAPES[0]
    : isParty
    ? PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-butter-daisy') || PASTEL_WASHI_TAPES[3]
    : PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-gingham') || PASTEL_WASHI_TAPES[1];

  const bottomWashi = isTeasingOrRagebait
    ? PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-matcha-grid') || PASTEL_WASHI_TAPES[2]
    : isCafe
    ? PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-butter-daisy') || PASTEL_WASHI_TAPES[3]
    : isParty
    ? PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-lavender-dots') || PASTEL_WASHI_TAPES[4]
    : PASTEL_WASHI_TAPES.find((t) => t.id === 'washi-pastel-pink') || PASTEL_WASHI_TAPES[0];

  // Pick Aesthetic Stickers from AESTHETIC_STICKERS
  const findSticker = (id: string) => AESTHETIC_STICKERS.find((s) => s.id === id) || AESTHETIC_STICKERS[0];
  const s1 = isTeasingOrRagebait
    ? findSticker('sticker-sparkles')
    : isCafe
    ? findSticker('sticker-matcha')
    : isParty
    ? findSticker('sticker-sparkles')
    : isCat
    ? findSticker('sticker-cat')
    : findSticker('sticker-bow');

  const s2 = isTeasingOrRagebait
    ? findSticker('sticker-star')
    : isCafe
    ? findSticker('sticker-croissant')
    : isParty
    ? findSticker('sticker-star')
    : isCat
    ? findSticker('sticker-paw')
    : findSticker('sticker-heart');

  const s3 = isTeasingOrRagebait
    ? findSticker('sticker-heart')
    : isCafe
    ? findSticker('sticker-coffee')
    : isParty
    ? findSticker('sticker-sakura')
    : findSticker('sticker-strawberry');

  // Pick a matching curated GIF from CURATED_GIFS
  const gif = isTeasingOrRagebait
    ? CURATED_GIFS.find((g) => g.id === 'gif-pusheen-snack') || CURATED_GIFS[3]
    : isCafe
    ? CURATED_GIFS.find((g) => g.id === 'gif-coffee-sip') || CURATED_GIFS[2]
    : isParty
    ? CURATED_GIFS.find((g) => g.id === 'gif-excited-yay') || CURATED_GIFS[9]
    : isCat
    ? CURATED_GIFS.find((g) => g.id === 'gif-bubu-dudu') || CURATED_GIFS[1]
    : CURATED_GIFS.find((g) => g.id === 'gif-cat-love') || CURATED_GIFS[0];

  // 1. Brush & Marker Strokes
  const strokes: DrawingStroke[] = [
    {
      id: `nerd-stroke-1-${Date.now()}`,
      tool: 'marker',
      color: primaryColor,
      size: 22,
      points: [
        { x: 48, y: 68 },
        { x: w - 48, y: 68 },
      ],
    },
    {
      id: `nerd-stroke-2-${Date.now()}`,
      tool: 'brush',
      color: primaryColor,
      size: 5,
      points: createFramePoints(22, 34, w - 44, h - 88),
    },
    {
      id: `nerd-stroke-3-${Date.now()}`,
      tool: 'brush',
      color: accentColor,
      size: 4,
      points: createWavePoints(46, w - 46, 108, 6, 7),
    },
    {
      id: `nerd-stroke-4-${Date.now()}`,
      tool: 'brush',
      color: isTeasingOrRagebait ? '#34d399' : '#f43f5e',
      size: 4,
      points: isParty || isTeasingOrRagebait
        ? createStarPoints(54, 152, 18, 8)
        : createHeartPoints(54, 152, 18),
    },
    {
      id: `nerd-stroke-5-${Date.now()}`,
      tool: 'brush',
      color: '#ec4899',
      size: 4,
      points: createHeartPoints(w - 56, h - 120, 20),
    },
  ];

  // 2. Creative In-Character Notes (NEVER copies the raw prompt string onto a note!)
  let headlineText = '💖 A Little Note Just For You 💌';
  let subNoteText = 'You make every single day brighter and extra special! 💖';
  let footerNoteText = 'Tap around & enjoy your custom page ✨';

  if (isTeasingOrRagebait) {
    headlineText = '🚨 OFFICIAL STINKY GF ALERT 🚨';
    subNoteText = '⚠️ Warning: Certified 100% Stinky Goofball Detected! (Days since last shower: 0 🦨💨)';
    footerNoteText = 'Jk... still my #1 favourite stinky human in the world 💖😂';
  } else if (isCafe) {
    headlineText = '☕ Cozy Cafe & Matcha Date 🍵';
    subNoteText = 'Sipping iced matcha, eating warm croissants & making sweet memories together!';
    footerNoteText = '10/10 Best Coffee Date Buddy ✨';
  } else if (isParty) {
    headlineText = '🎉 Best Day Ever! ✨🎂';
    subNoteText = 'Sending you the biggest hugs, sparkles, and happiest wishes today!';
    footerNoteText = 'Time to celebrate! 🥳💖';
  } else if (isCat) {
    headlineText = '🐱 Purr-fect Little Scrapbook 🐾';
    subNoteText = 'Official VIP Member of the Cozy Kitty & Cat Hugs Club!';
    footerNoteText = 'Meow & forever 🐾💕';
  }

  const notes: Omit<CanvasTextNote, 'id'>[] = [
    {
      text: headlineText,
      x: Math.max(20, Math.round((w - 200) / 2)),
      y: 52,
      color: noteInkColor,
      fontSize: 16,
      fontFamily: 'Caveat',
    },
    {
      text: subNoteText,
      x: Math.max(20, Math.round((w - 210) / 2)),
      y: 295,
      color: noteInkColor,
      fontSize: 15,
      fontFamily: 'Caveat',
    },
    {
      text: footerNoteText,
      x: Math.max(20, Math.round((w - 200) / 2)),
      y: h - 140,
      color: '#475569',
      fontSize: 14,
      fontFamily: 'Caveat',
    },
  ];

  // 3. Stickers, Washi Tapes & Animated GIF
  const stickers: Omit<CanvasSticker, 'id'>[] = [
    {
      url: topWashi.url,
      x: Math.round((w - topWashi.width) / 2),
      y: 16,
      width: topWashi.width,
      height: topWashi.height,
      rotation: 0,
      kind: 'washi',
      label: `${topWashi.emoji} ${topWashi.name} Washi Tape`,
    },
    {
      url: gif.url,
      x: Math.round((w - 136) / 2),
      y: 132,
      width: 136,
      height: 136,
      rotation: 0,
      kind: 'gif',
      label: gif.title,
    },
    {
      url: s1.url,
      x: 28,
      y: 185,
      width: 78,
      height: 78,
      rotation: 0,
      kind: 'sticker',
      label: `${s1.emoji} ${s1.name}`,
    },
    {
      url: s2.url,
      x: w - 106,
      y: 185,
      width: 78,
      height: 78,
      rotation: 0,
      kind: 'sticker',
      label: `${s2.emoji} ${s2.name}`,
    },
    {
      url: s3.url,
      x: 36,
      y: h - 180,
      width: 74,
      height: 74,
      rotation: 0,
      kind: 'sticker',
      label: `${s3.emoji} ${s3.name}`,
    },
    {
      url: bottomWashi.url,
      x: Math.round((w - bottomWashi.width) / 2),
      y: h - 86,
      width: bottomWashi.width,
      height: bottomWashi.height,
      rotation: 0,
      kind: 'washi',
      label: `${bottomWashi.emoji} ${bottomWashi.name} Washi Tape`,
    },
  ];

  return { strokes, notes, stickers };
}

export const NerdAssistModal: React.FC<NerdAssistModalProps> = ({
  isOpen,
  onClose,
  onRunAssist,
  isAssisting,
}) => {
  const [prompt, setPrompt] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isAssisting) return;
    onRunAssist(trimmed);
  };

  const handleQuickIdea = (ideaPrompt: string) => {
    setPrompt(ideaPrompt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border-2 border-pink-200 shadow-retro max-w-sm w-full p-5 sm:p-6 space-y-4 relative overflow-hidden">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isAssisting}
          className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-stone-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-pink-50 border-2 border-pink-200 shadow-retro-sm flex items-center justify-center text-xl flex-shrink-0">
            🤓
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1">
              <span>Nerd Assist</span>
              <Sparkles className="w-4 h-4 text-pink-500" />
            </h3>
            <p className="text-[11px] text-slate-500 leading-tight">
              Tell your nerd what you want! He'll doodle on your canvas with your pens, notes & stickers and build your webpage right away.
            </p>
          </div>
        </div>

        {/* Quick 1-Tap Prompt Chips */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-0.5">
            Quick Ideas
          </span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_IDEAS.map((idea) => (
              <button
                key={idea.label}
                type="button"
                onClick={() => handleQuickIdea(idea.prompt)}
                className="px-2.5 py-1 rounded-xl bg-pink-50/80 hover:bg-pink-100 border border-pink-200 text-slate-700 text-[11px] font-semibold transition-all active:scale-95"
              >
                {idea.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Make a funny ragebait page teasing my stinky gf, or a cozy matcha date scrapbook..."
            rows={3}
            maxLength={400}
            className="w-full p-3 text-xs rounded-2xl bg-stone-50 border border-stone-200 focus:bg-white focus:outline-none focus:border-pink-400 resize-none leading-relaxed text-slate-800"
            required
          />

          <button
            type="submit"
            disabled={!prompt.trim() || isAssisting}
            className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs shadow-retro-sm transition-all transform active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2"
          >
            {isAssisting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-pink-300" />
                <span>Your nerd is planning... 🤓</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-pink-300" />
                <span>Doodle & Build Webpage! 🤓✨</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
