/**
 * GitHub img/ Folder Photo Upload Service (Free Tier - Zero Firebase Storage)
 * Uploads photos dropped onto the canvas to the GitHub repository's img/ folder
 * via the Cloudflare Worker (/api/upload) and retrieves permanent public URLs
 * (https://islacowper.co.uk/img/...).
 * 
 * Includes pre-flight MIME type validation, content signature verification, and on-device
 * canvas image downsizing/optimization (<= 5MB, raster images only, EXIF stripped)
 * plus instant in-memory local preview caching while GitHub Pages deploys.
 */

import { getFirebaseAuth } from '../config/firebase';
import { callUploadPhotoApi } from './workerClient';
import {
  validateImageFile,
  validateImageContent,
  optimizeImageForUpload,
  MAX_STORAGE_FILE_SIZE,
} from './imageOptimizer';

export {
  validateImageFile,
  validateImageContent,
  sniffImageMimeTypeFromBuffer,
  optimizeImageForUpload,
  MAX_STORAGE_FILE_SIZE,
  MAX_CLIENT_INPUT_SIZE,
  MAX_IMAGE_DIMENSION,
  ALLOWED_IMAGE_TYPES,
} from './imageOptimizer';

/**
 * Bounded in-memory cache mapping canonical GitHub Pages URLs (https://islacowper.co.uk/img/...)
 * to local Data URLs so the Studio Canvas, Snapshot Exporter, and PreviewModal iframe render
 * newly uploaded photos with zero latency while GitHub Pages finishes its background build.
 */
const MAX_PREVIEW_CACHE_ENTRIES = 20;
const localPhotoPreviewCache = new Map<string, string>();

export function cacheLocalPhotoPreview(url: string, dataUrl: string): void {
  if (!url || !dataUrl) return;
  if (localPhotoPreviewCache.has(url)) {
    localPhotoPreviewCache.delete(url);
  } else if (localPhotoPreviewCache.size >= MAX_PREVIEW_CACHE_ENTRIES) {
    const oldestKey = localPhotoPreviewCache.keys().next().value;
    if (oldestKey) {
      localPhotoPreviewCache.delete(oldestKey);
    }
  }
  localPhotoPreviewCache.set(url, dataUrl);
}

export function resolveLocalPhotoPreview(url: string): string {
  return localPhotoPreviewCache.get(url) || url;
}

/**
 * Substitutes cached local Data URLs for any newly uploaded GitHub img/ URLs inside
 * generated HTML so the PreviewModal iframe renders photos immediately before GitHub Pages
 * finishes deploying the commit. Does not alter the canonical HTML sent to /api/publish.
 */
export function injectLocalPhotoPreviewsIntoHtml(html: string): string {
  if (!html || localPhotoPreviewCache.size === 0) return html;
  let previewHtml = html;
  for (const [remoteUrl, dataUrl] of localPhotoPreviewCache.entries()) {
    if (previewHtml.includes(remoteUrl)) {
      previewHtml = previewHtml.split(remoteUrl).join(dataUrl);
    }
    const fileMatch = remoteUrl.match(/\/img\/([a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp|gif))$/i);
    if (fileMatch) {
      const relSlash = `/img/${fileMatch[1]}`;
      const relBare = `img/${fileMatch[1]}`;
      if (previewHtml.includes(`"${relSlash}"`)) {
        previewHtml = previewHtml.split(`"${relSlash}"`).join(`"${dataUrl}"`);
      }
      if (previewHtml.includes(`'${relSlash}'`)) {
        previewHtml = previewHtml.split(`'${relSlash}'`).join(`'${dataUrl}'`);
      }
      if (previewHtml.includes(`"${relBare}"`)) {
        previewHtml = previewHtml.split(`"${relBare}"`).join(`"${dataUrl}"`);
      }
      if (previewHtml.includes(`'${relBare}'`)) {
        previewHtml = previewHtml.split(`'${relBare}'`).join(`'${dataUrl}'`);
      }
    }
  }
  return previewHtml;
}

async function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

export async function uploadPhotoToGitHub(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  // 1. Pre-flight metadata validation against allowed raster formats & size
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  // 2. Pre-flight content-level verification (magic numbers / signatures)
  const contentValidation = await validateImageContent(file);
  if (!contentValidation.valid) {
    throw new Error(contentValidation.error || 'Invalid image file content.');
  }

  // 3. On-device image downsizing, EXIF stripping & optimization via canvas
  const optimizedFile = await optimizeImageForUpload(file, { onProgress });

  // 4. Pre-flight verification of 5MB upload size limit
  if (optimizedFile.size > MAX_STORAGE_FILE_SIZE) {
    const sizeMb = (optimizedFile.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Photo exceeds the 5MB upload quota (${sizeMb}MB) even after optimization.`);
  }

  // 5. Authenticate via Firebase Auth (Free Spark Tier)
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) {
    throw new Error('Please sign in first to upload photos.');
  }

  const idToken = await auth.currentUser.getIdToken();
  const contentType =
    optimizedFile.type ||
    contentValidation.detectedType ||
    validation.detectedType ||
    'image/jpeg';

  onProgress?.('Uploading photo to GitHub img/ folder...');

  try {
    const dataBase64 = await blobToDataUrl(optimizedFile, contentType);
    const result = await callUploadPhotoApi({
      dataBase64,
      mimeType: contentType,
      fileName: optimizedFile.name,
      idToken,
    });

    if (result.url) {
      cacheLocalPhotoPreview(result.url, dataBase64);
    }

    return result.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Photo upload failed: ${msg}`);
  }
}

export const uploadPhotoToFirebase = uploadPhotoToGitHub;
