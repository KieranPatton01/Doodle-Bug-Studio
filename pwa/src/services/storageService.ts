/**
 * Firebase Storage Photo Upload Service
 * Uploads photos dropped onto the canvas and retrieves permanent public download URLs.
 * 
 * Includes pre-flight MIME type validation, content signature verification, and on-device
 * canvas image downsizing/optimization to satisfy storage.rules (<= 5MB, raster images only)
 * and provide fast mobile uploads.
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage } from '../config/firebase';
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

export async function uploadPhotoToFirebase(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  const storage = getFirebaseStorage();

  if (!storage || !storage.app) {
    throw new Error('Firebase Storage is not configured. Please check your Firebase environment configuration or choose a GIF/sticker from the tray.');
  }

  // 1. Pre-flight metadata validation against storage.rules constraints
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  // 2. Pre-flight content-level verification (magic numbers / signatures)
  const contentValidation = await validateImageContent(file);
  if (!contentValidation.valid) {
    throw new Error(contentValidation.error || 'Invalid image file content.');
  }

  // 3. On-device image downsizing & optimization via canvas
  const optimizedFile = await optimizeImageForUpload(file, { onProgress });

  // 4. Pre-flight verification of storage.rules size limit (<= 5MB)
  if (optimizedFile.size > MAX_STORAGE_FILE_SIZE) {
    const sizeMb = (optimizedFile.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Photo exceeds the 5MB upload quota (${sizeMb}MB) even after optimization.`);
  }

  onProgress?.('Uploading to Firebase Storage...');

  try {
    const sanitizedName = optimizedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `doodle_photos/${Date.now()}_${sanitizedName}`;
    const storageRef = ref(storage, storagePath);

    // Guaranteed fallback to valid raster MIME type to satisfy storage.rules
    const contentType = optimizedFile.type || contentValidation.detectedType || validation.detectedType || 'image/jpeg';
    const metadata = {
      contentType,
    };

    const snapshot = await uploadBytes(storageRef, optimizedFile, metadata);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Firebase Storage upload failed: ${msg}. Please ensure your storage bucket is configured and allows uploads.`);
  }
}
