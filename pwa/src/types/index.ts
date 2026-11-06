/**
 * TypeScript types and interfaces for Doodlebug PWA
 */

export type ToolType = 'brush' | 'eraser' | 'marker' | 'text' | 'sticker';

/** @deprecated Website theming feature has been removed */
export type VibeType = string;

export interface CanvasTextNote {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontFamily: 'Caveat' | 'system-ui';
}

export type StickerTrayTab = 'gifs' | 'stickers';

export interface CanvasSticker {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  kind?: 'photo' | 'gif' | 'sticker' | 'washi';
  label?: string;
}

export interface DrawingPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface DrawingStroke {
  id: string;
  tool: ToolType;
  color: string;
  size: number;
  points: DrawingPoint[];
}

export interface GenerateResult {
  html: string;
  model: string;
  vibe?: string;
}

export interface PublishResult {
  success: boolean;
  commitSha: string;
  htmlUrl: string;
  path: string;
  branch: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
  } | null;
  idToken: string | null;
}
