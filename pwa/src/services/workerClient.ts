/**
 * Cloudflare Worker Gateway API Client
 * Securely communicates with /api/generate and /api/publish
 * Zero client secrets: all operations are authenticated with Firebase ID token.
 */

import { GenerateResult, PublishResult, VibeType } from '../types';

export function getWorkerBaseUrl(): string {
  const customUrl = localStorage.getItem('doodlebug_worker_url');
  if (customUrl && !customUrl.includes('<') && !customUrl.includes('your-subdomain') && !customUrl.includes('your-account')) {
    return customUrl.replace(/\/+$/, '');
  }

  const envUrl = import.meta.env.VITE_WORKER_URL;
  if (envUrl && !envUrl.includes('<') && !envUrl.includes('your-subdomain') && !envUrl.includes('your-account')) {
    return envUrl.replace(/\/+$/, '');
  }

  // Default to local wrangler dev port if running locally
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8787';
  }

  return '';
}

export function setWorkerBaseUrl(url: string) {
  const trimmed = url.trim();
  if (trimmed) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        throw new Error('Worker URL must use HTTPS (or localhost for local development)');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('HTTPS')) throw e;
      throw new Error('Invalid URL format');
    }
  }
  localStorage.setItem('doodlebug_worker_url', trimmed);
}

export interface GenerateParams {
  snapshotBase64: string;
  imageUrls?: string[];
  notes?: string;
  idToken: string;
  /** @deprecated Website theming feature has been removed */
  vibe?: VibeType;
}

export interface PublishParams {
  html: string;
  commitMessage?: string;
  idToken: string;
}

/**
 * Calls Cloudflare Worker /api/generate
 */
export async function callGenerateApi(params: GenerateParams): Promise<GenerateResult> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    throw new Error('Cloudflare Worker URL is not configured. Please set VITE_WORKER_URL in your environment configuration.');
  }

  const url = `${baseUrl}/api/generate`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.idToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        snapshotBase64: params.snapshotBase64,
        imageUrls: params.imageUrls || [],
        notes: params.notes || '',
      }),
    });
  } catch (networkErr) {
    clearTimeout(timeoutId);
    if (networkErr instanceof Error && (networkErr.name === 'AbortError' || networkErr.message.includes('aborted'))) {
      throw new Error('Generation timed out after 60 seconds. Your nerd took a little too long building this. Please try again.');
    }
    throw networkErr;
  }

  clearTimeout(timeoutId);

  // If the server responded (e.g. 502 Bad Gateway, 403 Forbidden, 401 Unauthorized, 429), NEVER fall back to fake preview!
  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorData = (await response.json()) as { error?: string; message?: string };
      errorDetail = errorData.error || errorData.message || response.statusText;
    } catch {
      errorDetail = await response.text().catch(() => response.statusText);
    }
    const fullErrorMessage = `[HTTP ${response.status}] ${errorDetail || 'Server error'}`;
    console.error(`❌ Cloudflare Worker /api/generate responded with an error [HTTP ${response.status}]:`, {
      url,
      status: response.status,
      statusText: response.statusText,
      error: errorDetail,
    });
    throw new Error(fullErrorMessage);
  }

  const data = (await response.json()) as GenerateResult;
  return data;
}

/**
 * Calls Cloudflare Worker /api/publish
 */
export async function callPublishApi(params: PublishParams): Promise<PublishResult> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    throw new Error('Cloudflare Worker URL is not configured. Please set VITE_WORKER_URL in your environment configuration.');
  }
  const url = `${baseUrl}/api/publish`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.idToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        html: params.html,
        commitMessage: params.commitMessage,
      }),
    });
  } catch (networkErr) {
    clearTimeout(timeoutId);
    if (networkErr instanceof Error && (networkErr.name === 'AbortError' || networkErr.message.includes('aborted'))) {
      throw new Error('Publishing timed out after 30 seconds. Your nerd took a little too long publishing this. Please try again.');
    }
    throw networkErr;
  }

  clearTimeout(timeoutId);

  // If the server actually responded (e.g. 403 Forbidden or 401 Unauthorized), do NOT return fake success!
  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorData = (await response.json()) as { error?: string; message?: string };
      errorDetail = errorData.error || errorData.message || response.statusText;
    } catch {
      errorDetail = await response.text().catch(() => response.statusText);
    }
    const fullErrorMessage = `[HTTP ${response.status}] ${errorDetail || 'Server error'}`;
    console.error(`❌ Cloudflare Worker /api/publish error [HTTP ${response.status}]:`, {
      url,
      status: response.status,
      statusText: response.statusText,
      error: errorDetail,
    });
    throw new Error(fullErrorMessage);
  }

  const data = (await response.json()) as PublishResult;
  return data;
}

export interface UploadPhotoParams {
  dataBase64: string;
  mimeType: string;
  fileName: string;
  idToken: string;
}

export interface UploadPhotoResult {
  success: boolean;
  url: string;
  path: string;
  commitSha: string;
}

/**
 * Calls Cloudflare Worker /api/upload to store an optimized photo in the GitHub img/ folder
 */
export async function callUploadPhotoApi(params: UploadPhotoParams): Promise<UploadPhotoResult> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    throw new Error('Cloudflare Worker URL is not configured. Please set VITE_WORKER_URL in your environment configuration.');
  }

  const url = `${baseUrl}/api/upload`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.idToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        dataBase64: params.dataBase64,
        mimeType: params.mimeType,
        fileName: params.fileName,
      }),
    });
  } catch (networkErr) {
    clearTimeout(timeoutId);
    if (networkErr instanceof Error && (networkErr.name === 'AbortError' || networkErr.message.includes('aborted'))) {
      throw new Error('Photo upload timed out after 30 seconds. Please try again.');
    }
    throw networkErr;
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorData = (await response.json()) as { error?: string; message?: string };
      errorDetail = errorData.error || errorData.message || response.statusText;
    } catch {
      errorDetail = await response.text().catch(() => response.statusText);
    }
    const fullErrorMessage = `[HTTP ${response.status}] ${errorDetail || 'Server error'}`;
    console.error(`❌ Cloudflare Worker /api/upload error [HTTP ${response.status}]:`, {
      url,
      status: response.status,
      statusText: response.statusText,
      error: errorDetail,
    });
    throw new Error(fullErrorMessage);
  }

  return (await response.json()) as UploadPhotoResult;
}

export interface AssistApiParams {
  prompt: string;
  width: number;
  height: number;
  idToken: string;
}

export interface AssistApiResponse {
  strokes: Array<{
    tool: 'brush' | 'marker';
    color: string;
    size: number;
    points: Array<{ x: number; y: number }>;
  }>;
  notes: Array<{
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
  }>;
  stickers: Array<{
    assetId: string;
    x: number;
    y: number;
  }>;
}

/**
 * Calls Cloudflare Worker /api/assist so Gemini designs a custom canvas layout
 */
export async function callAssistApi(params: AssistApiParams): Promise<AssistApiResponse> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    throw new Error('Cloudflare Worker URL is not configured.');
  }

  const url = `${baseUrl}/api/assist`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.idToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: params.prompt,
        width: params.width,
        height: params.height,
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`[HTTP ${response.status}] ${errText}`);
  }

  return (await response.json()) as AssistApiResponse;
}
