import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, Sparkles, Loader2, Search } from 'lucide-react';
import { uploadPhotoToGitHub, validateImageFile, validateImageContent } from '../services/storageService';
import { StickerTrayTab, CanvasSticker } from '../types';

export interface PlaceStickerOptions {
  kind?: CanvasSticker['kind'];
  width?: number;
  height?: number;
  label?: string;
}

interface StickerTrayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlacePhoto: (photoUrl: string, options?: PlaceStickerOptions) => void;
  attachedUrls: string[];
  initialTab?: StickerTrayTab;
}

export interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  tags: string[];
}

// Public no-API-key-setup GIF search keys (Giphy web SDK key primary + Tenor v1 fallback)
const GIPHY_PUBLIC_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';
const TENOR_PUBLIC_KEY = 'LIVDSRZULELA';

// Rich curated fallback & instant-browse GIF library (verified 200 OK + CORS-enabled Giphy CDN)
export const CURATED_GIFS: GifItem[] = [
  {
    id: 'gif-cat-love',
    title: 'Cute Cat Hug 💖',
    url: 'https://media.giphy.com/media/c76IJLufpNwSULPk77/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/c76IJLufpNwSULPk77/200w.gif',
    tags: ['trending', 'cat', 'cats', 'love', 'heart', 'cute', 'peach'],
  },
  {
    id: 'gif-bubu-dudu',
    title: 'Vibing Cat Jam 🎶',
    url: 'https://media.giphy.com/media/GeimqsH0TLDt4tScGw/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/GeimqsH0TLDt4tScGw/200w.gif',
    tags: ['trending', 'cat', 'cats', 'happy', 'sparkle', 'cute', 'music', 'dance'],
  },
  {
    id: 'gif-coffee-cozy',
    title: 'Morning Coffee ☕',
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif',
    tags: ['trending', 'coffee', 'cafe', 'happy', 'party', 'dance'],
  },
  {
    id: 'gif-pusheen-snack',
    title: 'Cozy Kitty Typing 💻',
    url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/200w.gif',
    tags: ['trending', 'cat', 'cats', 'cute', 'funny', 'typing'],
  },
  {
    id: 'gif-hearts-float',
    title: 'Floating Hearts 💕',
    url: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/200w.gif',
    tags: ['trending', 'love', 'heart', 'hearts', 'cute', 'pink', 'sparkle'],
  },
  {
    id: 'gif-happy-cat',
    title: 'Happy Vibes Cat 🐾',
    url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/200w.gif',
    tags: ['trending', 'cat', 'cats', 'love', 'kiss', 'cute', 'happy'],
  },
  {
    id: 'gif-coffee-sip',
    title: 'Sipping Tea & Coffee 🍵',
    url: 'https://media.giphy.com/media/3o85xGocUH8RYoDKKs/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o85xGocUH8RYoDKKs/200w.gif',
    tags: ['coffee', 'cafe', 'matcha', 'tea', 'cozy', 'cute'],
  },
  {
    id: 'gif-sparkles-magic',
    title: 'Pink Sparkles ✨',
    url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/200w.gif',
    tags: ['sparkle', 'sparkles', 'love', 'heart', 'pink', 'cute'],
  },
  {
    id: 'gif-cute-bunny',
    title: 'Sweet Sleepy Kitten 🐱',
    url: 'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/200w.gif',
    tags: ['cute', 'cat', 'cats', 'kitten', 'happy', 'sleepy'],
  },
  {
    id: 'gif-excited-yay',
    title: 'So Excited Yay! 🌸',
    url: 'https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/11sBLVxNs7v6WA/200w.gif',
    tags: ['happy', 'yay', 'excited', 'party', 'trending', 'cute'],
  },
  {
    id: 'gif-cozy-rain',
    title: 'Cozy Lo-Fi Vibe 🌧️',
    url: 'https://media.giphy.com/media/W3QKEujo8vztC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/W3QKEujo8vztC/200w.gif',
    tags: ['cafe', 'coffee', 'cat', 'cozy', 'cute', 'chill'],
  },
  {
    id: 'gif-star-shine',
    title: 'Shining Star 🌟',
    url: 'https://media.giphy.com/media/l4FGpP4lxGGgK5CBW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l4FGpP4lxGGgK5CBW/200w.gif',
    tags: ['sparkle', 'star', 'stars', 'cute', 'magic', 'love'],
  },
];

const GIF_CATEGORIES = [
  { label: '✨ Trending', query: '' },
  { label: '🐱 Cats', query: 'cute cat' },
  { label: '☕ Cafe', query: 'cute coffee matcha' },
  { label: '💖 Love', query: 'cute love heart' },
  { label: '🌸 Cute', query: 'kawaii cute pastel' },
  { label: '🎉 Happy', query: 'happy dance cute' },
  { label: '✨ Sparkle', query: 'sparkles aesthetic' },
];

function svgToDataUrl(svgString: string): string {
  const wellFormed = svgString
    .trim()
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return `data:image/svg+xml;utf8,${encodeURIComponent(wellFormed)}`;
}

export interface AestheticStickerDef {
  id: string;
  name: string;
  emoji: string;
  kind: 'sticker' | 'washi';
  width: number;
  height: number;
  url: string;
}

export const PASTEL_WASHI_TAPES: AestheticStickerDef[] = [
  {
    id: 'washi-pastel-pink',
    name: 'Pastel Pink',
    emoji: '🩷',
    kind: 'washi',
    width: 160,
    height: 36,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
        <path d="M8,6 L14,14 L8,22 L15,30 L7,38 L14,46 L8,54 L15,62 L8,66 L312,66 L305,58 L312,50 L306,42 L313,34 L305,26 L312,18 L306,10 L312,6 Z" fill="#F9A8D4" fill-opacity="0.82" stroke="#F472B6" stroke-width="1.5"/>
        <line x1="24" y1="20" x2="296" y2="20" stroke="#FFF" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="8 6"/>
        <line x1="24" y1="52" x2="296" y2="52" stroke="#FFF" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="8 6"/>
      </svg>
    `),
  },
  {
    id: 'washi-gingham',
    name: 'Pink Gingham',
    emoji: '💗',
    kind: 'washi',
    width: 160,
    height: 36,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
        <defs>
          <pattern id="gingham" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="#FFF5F7"/>
            <rect width="12" height="24" fill="#F472B6" fill-opacity="0.35"/>
            <rect width="24" height="12" fill="#F472B6" fill-opacity="0.35"/>
          </pattern>
        </defs>
        <path d="M8,6 L14,14 L8,22 L15,30 L7,38 L14,46 L8,54 L15,62 L8,66 L312,66 L305,58 L312,50 L306,42 L313,34 L305,26 L312,18 L306,10 L312,6 Z" fill="url(#gingham)" stroke="#F472B6" stroke-width="1.5"/>
      </svg>
    `),
  },
  {
    id: 'washi-matcha-grid',
    name: 'Matcha Grid',
    emoji: '🍵',
    kind: 'washi',
    width: 160,
    height: 36,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
        <defs>
          <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#ECFDF5" fill-opacity="0.9"/>
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#6EE7B7" stroke-width="1.5"/>
          </pattern>
        </defs>
        <path d="M8,6 L14,14 L8,22 L15,30 L7,38 L14,46 L8,54 L15,62 L8,66 L312,66 L305,58 L312,50 L306,42 L313,34 L305,26 L312,18 L306,10 L312,6 Z" fill="url(#grid)" stroke="#34D399" stroke-width="1.5"/>
      </svg>
    `),
  },
  {
    id: 'washi-butter-daisy',
    name: 'Butter Daisy',
    emoji: '🌼',
    kind: 'washi',
    width: 160,
    height: 36,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
        <path d="M8,6 L14,14 L8,22 L15,30 L7,38 L14,46 L8,54 L15,62 L8,66 L312,66 L305,58 L312,50 L306,42 L313,34 L305,26 L312,18 L306,10 L312,6 Z" fill="#FDE68A" fill-opacity="0.88" stroke="#F59E0B" stroke-width="1.5"/>
        <g fill="#FFF">
          <circle cx="55" cy="36" r="10"/><circle cx="125" cy="36" r="10"/><circle cx="195" cy="36" r="10"/><circle cx="265" cy="36" r="10"/>
        </g>
        <g fill="#F59E0B">
          <circle cx="55" cy="36" r="4"/><circle cx="125" cy="36" r="4"/><circle cx="195" cy="36" r="4"/><circle cx="265" cy="36" r="4"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'washi-lavender-dots',
    name: 'Lilac Polka',
    emoji: '💜',
    kind: 'washi',
    width: 160,
    height: 36,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
        <path d="M8,6 L14,14 L8,22 L15,30 L7,38 L14,46 L8,54 L15,62 L8,66 L312,66 L305,58 L312,50 L306,42 L313,34 L305,26 L312,18 L306,10 L312,6 Z" fill="#DDD6FE" fill-opacity="0.88" stroke="#A78BFA" stroke-width="1.5"/>
        <g fill="#FFFFFF" fill-opacity="0.85">
          <circle cx="40" cy="24" r="5"/><circle cx="80" cy="48" r="5"/><circle cx="120" cy="24" r="5"/><circle cx="160" cy="48" r="5"/><circle cx="200" cy="24" r="5"/><circle cx="240" cy="48" r="5"/><circle cx="280" cy="24" r="5"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'washi-sky-Blue',
    name: 'Cloud Blue',
    emoji: '🩵',
    kind: 'washi',
    width: 160,
    height: 36,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
        <defs>
          <pattern id="bluegrid" width="18" height="18" patternUnits="userSpaceOnUse">
            <rect width="18" height="18" fill="#E0F2FE" fill-opacity="0.9"/>
            <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#7DD3FC" stroke-width="1.5"/>
          </pattern>
        </defs>
        <path d="M8,6 L14,14 L8,22 L15,30 L7,38 L14,46 L8,54 L15,62 L8,66 L312,66 L305,58 L312,50 L306,42 L313,34 L305,26 L312,18 L306,10 L312,6 Z" fill="url(#bluegrid)" stroke="#38BDF8" stroke-width="1.5"/>
      </svg>
    `),
  },
];

export const AESTHETIC_STICKERS: AestheticStickerDef[] = [
  {
    id: 'sticker-bow',
    name: 'Coquette Bow',
    emoji: '🎀',
    kind: 'sticker',
    width: 92,
    height: 92,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <g stroke="#BE185D" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
          <path d="M78,78 C45,35 16,48 22,82 C28,110 56,105 78,84 Z" fill="#F9A8D4"/>
          <path d="M82,78 C115,35 144,48 138,82 C132,110 104,105 82,84 Z" fill="#F9A8D4"/>
          <path d="M72,86 C58,115 44,136 35,146 C48,144 65,126 78,92" fill="#F472B6"/>
          <path d="M88,86 C102,115 116,136 125,146 C112,144 95,126 82,92" fill="#F472B6"/>
          <ellipse cx="80" cy="82" rx="12" ry="14" fill="#EC4899"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'sticker-cat',
    name: 'Kawaii Kitty',
    emoji: '🐱',
    kind: 'sticker',
    width: 96,
    height: 96,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <path d="M32,68 L26,24 L64,46 Q80,42 96,46 L134,24 L128,68 C138,86 134,126 80,128 C26,126 22,86 32,68 Z" fill="#FFFBEB" stroke="#475569" stroke-width="4.5" stroke-linejoin="round"/>
        <polygon points="34,56 32,32 56,46" fill="#F9A8D4"/>
        <polygon points="126,56 128,32 104,46" fill="#F9A8D4"/>
        <circle cx="58" cy="84" r="5.5" fill="#1E293B"/>
        <circle cx="102" cy="84" r="5.5" fill="#1E293B"/>
        <ellipse cx="46" cy="94" rx="8" ry="4.5" fill="#F9A8D4" fill-opacity="0.7"/>
        <ellipse cx="114" cy="94" rx="8" ry="4.5" fill="#F9A8D4" fill-opacity="0.7"/>
        <path d="M74,92 Q80,98 86,92" fill="none" stroke="#E11D48" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'sticker-matcha',
    name: 'Iced Matcha',
    emoji: '🍵',
    kind: 'sticker',
    width: 92,
    height: 92,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <line x1="92" y1="16" x2="78" y2="62" stroke="#F472B6" stroke-width="8" stroke-linecap="round"/>
        <path d="M44,56 L116,56 L106,138 C105,143 100,146 94,146 L66,146 C60,146 55,143 54,138 Z" fill="#A7F3D0" stroke="#065F46" stroke-width="4" stroke-linejoin="round"/>
        <path d="M40,56 Q80,26 120,56 Z" fill="#ECFDF5" stroke="#065F46" stroke-width="4" stroke-linejoin="round"/>
        <rect x="60" y="70" width="16" height="16" rx="4" fill="#FFFFFF" fill-opacity="0.75"/>
        <rect x="84" y="76" width="16" height="16" rx="4" fill="#FFFFFF" fill-opacity="0.75"/>
        <circle cx="80" cy="110" r="14" fill="#FFFFFF" fill-opacity="0.85"/>
        <text x="80" y="115" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="bold" fill="#065F46">🍵</text>
      </svg>
    `),
  },
  {
    id: 'sticker-coffee',
    name: 'Latte Love',
    emoji: '☕',
    kind: 'sticker',
    width: 92,
    height: 92,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <path d="M112,72 C132,72 132,104 112,104" fill="none" stroke="#78350F" stroke-width="6" stroke-linecap="round"/>
        <path d="M36,60 L114,60 L106,120 C104,132 92,138 75,138 C58,138 46,132 44,120 Z" fill="#FDE68A" stroke="#78350F" stroke-width="4" stroke-linejoin="round"/>
        <ellipse cx="75" cy="60" rx="39" ry="12" fill="#D97706" stroke="#78350F" stroke-width="4"/>
        <path d="M75,65 C68,58 62,62 67,68 L75,74 L83,68 C88,62 82,58 75,65 Z" fill="#FFFBEB"/>
      </svg>
    `),
  },
  {
    id: 'sticker-sparkles',
    name: 'Sparkles',
    emoji: '✨',
    kind: 'sticker',
    width: 88,
    height: 88,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <path d="M72,18 Q72,66 24,66 Q72,66 72,114 Q72,66 120,66 Q72,66 72,18 Z" fill="#FDE047" stroke="#CA8A04" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M122,82 Q122,108 96,108 Q122,108 122,134 Q122,108 148,108 Q122,108 122,82 Z" fill="#F9A8D4" stroke="#DB2777" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="36" cy="116" r="7" fill="#A7F3D0" stroke="#059669" stroke-width="2.5"/>
      </svg>
    `),
  },
  {
    id: 'sticker-heart',
    name: 'Puffy Heart',
    emoji: '💖',
    kind: 'sticker',
    width: 88,
    height: 88,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <path d="M80,136 C80,136 20,98 20,56 C20,34 38,22 56,22 C68,22 76,30 80,38 C84,30 92,22 104,22 C122,22 140,34 140,56 C140,98 80,136 80,136 Z" fill="#F472B6" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/>
        <path d="M80,136 C80,136 20,98 20,56 C20,34 38,22 56,22 C68,22 76,30 80,38 C84,30 92,22 104,22 C122,22 140,34 140,56 C140,98 80,136 80,136 Z" fill="none" stroke="#BE185D" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M40,52 C40,42 48,36 56,36" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'sticker-star',
    name: 'Pastel Star',
    emoji: '⭐',
    kind: 'sticker',
    width: 88,
    height: 88,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <polygon points="80,16 99,56 144,62 111,93 119,138 80,116 41,138 49,93 16,62 61,56" fill="#FDE047" stroke="#CA8A04" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="66" cy="76" r="4.5" fill="#713F12"/>
        <circle cx="94" cy="76" r="4.5" fill="#713F12"/>
        <path d="M74,88 Q80,94 86,88" fill="none" stroke="#713F12" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'sticker-sakura',
    name: 'Sakura Flower',
    emoji: '🌸',
    kind: 'sticker',
    width: 88,
    height: 88,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <g fill="#FBCFE8" stroke="#EC4899" stroke-width="3.5">
          <circle cx="80" cy="42" r="24"/>
          <circle cx="116" cy="68" r="24"/>
          <circle cx="102" cy="112" r="24"/>
          <circle cx="58" cy="112" r="24"/>
          <circle cx="44" cy="68" r="24"/>
        </g>
        <circle cx="80" cy="80" r="14" fill="#FDE047" stroke="#CA8A04" stroke-width="3"/>
      </svg>
    `),
  },
  {
    id: 'sticker-strawberry',
    name: 'Strawberry',
    emoji: '🍓',
    kind: 'sticker',
    width: 88,
    height: 88,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <path d="M80,138 C46,138 34,90 44,62 C52,42 108,42 116,62 C126,90 114,138 80,138 Z" fill="#FB7185" stroke="#BE123C" stroke-width="4" stroke-linejoin="round"/>
        <path d="M52,52 Q80,70 108,52 Q92,34 80,46 Q68,34 52,52 Z" fill="#4ADE80" stroke="#15803D" stroke-width="3.5" stroke-linejoin="round"/>
        <g fill="#FEF08A">
          <circle cx="64" cy="78" r="3"/><circle cx="96" cy="78" r="3"/><circle cx="80" cy="92" r="3"/><circle cx="66" cy="108" r="3"/><circle cx="94" cy="108" r="3"/><circle cx="80" cy="120" r="3"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'sticker-paw',
    name: 'Kitty Paw',
    emoji: '🐾',
    kind: 'sticker',
    width: 88,
    height: 88,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="84" r="54" fill="#FFF1F2" stroke="#F43F5E" stroke-width="4"/>
        <ellipse cx="80" cy="98" rx="22" ry="18" fill="#F472B6"/>
        <ellipse cx="52" cy="70" rx="9" ry="12" transform="rotate(-20 52 70)" fill="#F472B6"/>
        <ellipse cx="70" cy="58" rx="9" ry="12" transform="rotate(-6 70 58)" fill="#F472B6"/>
        <ellipse cx="90" cy="58" rx="9" ry="12" transform="rotate(6 90 58)" fill="#F472B6"/>
        <ellipse cx="108" cy="70" rx="9" ry="12" transform="rotate(20 108 70)" fill="#F472B6"/>
      </svg>
    `),
  },
  {
    id: 'sticker-polaroid-corners',
    name: 'Photo Corners',
    emoji: '📐',
    kind: 'sticker',
    width: 110,
    height: 110,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <polygon points="14,14 58,14 14,58" fill="#F9A8D4" stroke="#DB2777" stroke-width="3" stroke-linejoin="round"/>
        <polygon points="146,14 102,14 146,58" fill="#F9A8D4" stroke="#DB2777" stroke-width="3" stroke-linejoin="round"/>
        <polygon points="14,146 58,146 14,102" fill="#F9A8D4" stroke="#DB2777" stroke-width="3" stroke-linejoin="round"/>
        <polygon points="146,146 102,146 146,102" fill="#F9A8D4" stroke="#DB2777" stroke-width="3" stroke-linejoin="round"/>
      </svg>
    `),
  },
  {
    id: 'sticker-croissant',
    name: 'Croissant',
    emoji: '🥐',
    kind: 'sticker',
    width: 92,
    height: 92,
    url: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <path d="M26,96 C18,64 46,38 80,38 C114,38 142,64 134,96 C128,116 108,112 102,94 C96,80 64,80 58,94 C52,112 32,116 26,96 Z" fill="#F59E0B" stroke="#78350F" stroke-width="4" stroke-linejoin="round"/>
        <path d="M54,46 Q80,68 106,46" fill="none" stroke="#FEF3C7" stroke-width="4" stroke-linecap="round"/>
        <path d="M38,68 Q80,84 122,68" fill="none" stroke="#FEF3C7" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `),
  },
];

export const StickerTrayModal: React.FC<StickerTrayModalProps> = ({
  isOpen,
  onClose,
  onPlacePhoto,
  attachedUrls,
  initialTab = 'gifs',
}) => {
  const [activeTab, setActiveTab] = useState<StickerTrayTab>(initialTab);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GIF search & browse state
  const [gifSearchQuery, setGifSearchQuery] = useState<string>('');
  const [gifResults, setGifResults] = useState<GifItem[]>(CURATED_GIFS);
  const [isSearchingGifs, setIsSearchingGifs] = useState<boolean>(false);
  const gifRequestIdRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Search GIFs via public no-API-key Giphy & Tenor endpoints with curated fallback
  const fetchGifs = useCallback(async (query: string) => {
    const requestId = ++gifRequestIdRef.current;
    const trimmed = query.trim().toLowerCase();

    // Local filter from curated GIFs as immediate baseline/fallback
    const localMatches = trimmed
      ? CURATED_GIFS.filter(
          (g) =>
            g.title.toLowerCase().includes(trimmed) ||
            g.tags.some((t) => t.toLowerCase().includes(trimmed) || trimmed.includes(t.toLowerCase()))
        )
      : CURATED_GIFS;

    setIsSearchingGifs(true);

    // 1. Primary live provider: Giphy public web API (CORS-enabled, 200 OK)
    try {
      const giphyEndpoint = trimmed
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_PUBLIC_KEY}&q=${encodeURIComponent(trimmed)}&limit=24&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_PUBLIC_KEY}&limit=24&rating=g`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(giphyEndpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const payload = (await res.json()) as {
          data?: Array<{
            id?: string;
            title?: string;
            images?: {
              downsized?: { url?: string };
              fixed_height?: { url?: string };
              original?: { url?: string };
            };
          }>;
        };

        const giphyItems: GifItem[] = [];
        for (const item of payload.data || []) {
          const cleanId = item.id?.trim();
          const fullUrl = cleanId
            ? `https://media.giphy.com/media/${cleanId}/giphy.gif`
            : item.images?.downsized?.url || item.images?.original?.url;
          const preview = cleanId
            ? `https://media.giphy.com/media/${cleanId}/200w.gif`
            : item.images?.fixed_height?.url || fullUrl;
          if (fullUrl && fullUrl.startsWith('https://')) {
            giphyItems.push({
              id: `giphy-${cleanId || Math.random().toString(36).slice(2)}`,
              title: (item.title || 'Cute GIF').replace(/\s*GIF(\s+by\s+.*)?$/i, '').trim() || 'Cute GIF',
              url: fullUrl,
              previewUrl: preview || fullUrl,
              tags: trimmed ? [trimmed] : ['trending'],
            });
          }
        }

        if (giphyItems.length > 0) {
          if (requestId === gifRequestIdRef.current) {
            setGifResults(giphyItems);
            setIsSearchingGifs(false);
          }
          return;
        }
      }
    } catch {
      // Fall through to Tenor / curated fallback
    }

    // 2. Secondary provider: Tenor v1 public endpoint
    try {
      const tenorEndpoint = trimmed
        ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(trimmed)}&key=${TENOR_PUBLIC_KEY}&limit=24&media_filter=minimal&contentfilter=medium`
        : `https://g.tenor.com/v1/trending?key=${TENOR_PUBLIC_KEY}&limit=24&media_filter=minimal&contentfilter=medium`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(tenorEndpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{
            id?: string;
            title?: string;
            content_description?: string;
            media?: Array<{
              gif?: { url?: string };
              tinygif?: { url?: string };
            }>;
          }>;
        };

        const remoteGifs: GifItem[] = [];
        for (const item of data.results || []) {
          const mediaObj = item.media?.[0];
          const fullUrl = mediaObj?.gif?.url || mediaObj?.tinygif?.url;
          const preview = mediaObj?.tinygif?.url || fullUrl;
          if (fullUrl && fullUrl.startsWith('https://')) {
            remoteGifs.push({
              id: `tenor-${item.id || Math.random().toString(36).slice(2)}`,
              title: item.content_description || item.title || 'Cute GIF',
              url: fullUrl,
              previewUrl: preview || fullUrl,
              tags: trimmed ? [trimmed] : ['trending'],
            });
          }
        }

        if (remoteGifs.length > 0) {
          if (requestId === gifRequestIdRef.current) {
            setGifResults(remoteGifs);
            setIsSearchingGifs(false);
          }
          return;
        }
      }
    } catch {
      // Network offline or blocked; fall back gracefully to curated GIFs
    }

    if (requestId === gifRequestIdRef.current) {
      setGifResults(localMatches.length > 0 ? localMatches : CURATED_GIFS);
      setIsSearchingGifs(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'gifs') return;
    const timer = setTimeout(() => {
      fetchGifs(gifSearchQuery);
    }, 260);
    return () => clearTimeout(timer);
  }, [gifSearchQuery, isOpen, activeTab, fetchGifs]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Immediate client-side pre-flight metadata validation
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid image file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadStatus('Checking photo format...');

    // Content-level magic byte check
    const contentCheck = await validateImageContent(file);
    if (!contentCheck.valid) {
      setUploadError(contentCheck.error || 'Invalid image file.');
      setIsUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadStatus('Optimizing photo on device...');

    try {
      const permanentUrl = await uploadPhotoToGitHub(file, (status) => {
        setUploadStatus(status);
      });
      onPlacePhoto(permanentUrl, { kind: 'photo', label: 'Photo' });
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-retro max-w-md w-full p-4 sm:p-5 space-y-3.5 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {activeTab === 'gifs' ? '📸' : '✨'}
            </span>
            <h3 className="font-extrabold text-slate-900 text-base">
              {activeTab === 'gifs'
                ? 'Photos & Aesthetic GIFs'
                : 'Sticker & Washi Tape Tray'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-stone-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tray Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-2xl text-xs font-bold flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('gifs')}
            className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'gifs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📸</span>
            <span>GIFs/Photo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'stickers'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>✨</span>
            <span>Stickers/Tape</span>
          </button>
        </div>

        {/* TAB 1: PHOTOS & SCROLLABLE / SEARCHABLE GIFS */}
        {activeTab === 'gifs' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {/* Phone Upload Trigger Button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full py-2.5 px-4 rounded-2xl border-2 border-dashed border-pink-300 hover:border-pink-500 bg-pink-50/60 hover:bg-pink-50 flex items-center justify-center gap-3 transition-all group"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 text-pink-600 animate-spin" />
                    <span className="text-xs font-semibold text-pink-700">
                      {uploadStatus || 'Uploading photo to GitHub img/...'}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                      <Upload className="w-4 h-4 text-pink-600" />
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-slate-800 block">Upload Photo from Phone</span>
                      <span className="text-[11px] text-slate-500 block">Auto-resized & optimized • Saved to GitHub img/</span>
                    </div>
                  </>
                )}
              </button>

              {uploadError && (
                <p className="mt-1.5 text-xs text-rose-600 font-medium">{uploadError}</p>
              )}
            </div>

            {/* Searchable & Scrollable GIF Browser */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-pink-500" /> Scroll or search GIFs:
                </span>
                {isSearchingGifs && (
                  <span className="text-[11px] text-pink-600 font-medium flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                  </span>
                )}
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={gifSearchQuery}
                  onChange={(e) => setGifSearchQuery(e.target.value)}
                  placeholder="Search GIFs (cat, coffee, love, sparkle)..."
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:border-pink-400 font-medium text-slate-800"
                />
                {gifSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setGifSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Quick Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {GIF_CATEGORIES.map((cat) => {
                  const isSelected = gifSearchQuery === cat.query;
                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => setGifSearchQuery(cat.query)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                        isSelected
                          ? 'bg-pink-500 text-white shadow-xs'
                          : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Scrollable GIF Grid */}
              <div className="max-h-56 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gifResults.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => {
                      onPlacePhoto(gif.url, { kind: 'gif', label: gif.title });
                      onClose();
                    }}
                    className="group relative rounded-2xl border border-stone-200 overflow-hidden text-left hover:border-pink-400 hover:shadow-sm transition-all transform active:scale-95 bg-stone-50"
                  >
                    <div className="aspect-square w-full overflow-hidden bg-stone-100">
                      <img
                        src={gif.previewUrl}
                        alt={gif.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        crossOrigin="anonymous"
                      />
                    </div>
                    <div className="p-1 bg-white/95 text-center">
                      <span className="text-[10px] font-semibold text-slate-700 truncate block">
                        {gif.title}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AESTHETIC STICKER & WASHI TAPE TRAY */}
        {activeTab === 'stickers' && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
            {/* Washi Tape Strips Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">
                  🩹 Washi Tape Strips (tap to place & rotate):
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PASTEL_WASHI_TAPES.map((tape) => (
                  <button
                    key={tape.id}
                    type="button"
                    onClick={() => {
                      onPlacePhoto(tape.url, {
                        kind: 'washi',
                        width: tape.width,
                        height: tape.height,
                        label: `${tape.name} Washi Tape`,
                      });
                      onClose();
                    }}
                    className="p-2 rounded-2xl border border-stone-200 hover:border-pink-400 bg-stone-50/70 hover:bg-pink-50/40 flex flex-col items-center gap-1 transition-all transform active:scale-95"
                  >
                    <img
                      src={tape.url}
                      alt={tape.name}
                      className="w-full h-7 object-contain pointer-events-none"
                    />
                    <span className="text-[10px] font-bold text-slate-600">
                      {tape.emoji} {tape.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cute Die-Cut Stickers Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">
                  ✨ Cute Aesthetic Stickers (tap to stamp):
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {AESTHETIC_STICKERS.map((sticker) => (
                  <button
                    key={sticker.id}
                    type="button"
                    onClick={() => {
                      onPlacePhoto(sticker.url, {
                        kind: 'sticker',
                        width: sticker.width,
                        height: sticker.height,
                        label: `${sticker.name} Sticker (${sticker.emoji})`,
                      });
                      onClose();
                    }}
                    className="p-2 rounded-2xl border border-stone-200 hover:border-pink-400 bg-stone-50/60 hover:bg-pink-50/40 flex flex-col items-center justify-center gap-1 transition-all transform active:scale-95"
                  >
                    <img
                      src={sticker.url}
                      alt={sticker.name}
                      className="w-12 h-12 object-contain pointer-events-none drop-shadow-xs"
                    />
                    <span className="text-[10px] font-semibold text-slate-700 truncate max-w-full">
                      {sticker.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {attachedUrls.length > 0 && (
          <div className="pt-2 border-t border-stone-100 text-[11px] text-slate-500 text-center flex-shrink-0">
            {attachedUrls.length} item(s) currently placed on canvas
          </div>
        )}

      </div>
    </div>
  );
};
