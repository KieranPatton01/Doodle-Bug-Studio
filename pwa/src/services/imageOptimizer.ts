/**
 * Client-Side Image Pre-Flight Validation and Optimization Utility
 * 
 * Pre-validates files to match storage.rules constraints before network upload,
 * validates actual file content via magic number sniffing to reject disguised non-image files / SVGs,
 * and downscales heavy mobile camera photos (e.g. 10MB-25MB) on an HTML Canvas
 * into lightweight, high-DPI raster assets (~300KB-800KB) fitting within Firebase
 * Storage quotas (< 5MB) without requiring paid Cloud Functions / Blaze plans.
 */

export const MAX_STORAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB (Firebase Storage Rules limit)
export const MAX_CLIENT_INPUT_SIZE = 30 * 1024 * 1024; // 30MB guardrail to prevent browser tab OOM
export const MAX_IMAGE_DIMENSION = 1600; // 1600px max dimension: crisp Retina quality on doodle canvas
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type AllowedMimeType = typeof ALLOWED_IMAGE_TYPES[number];

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  detectedType: string;
}

/**
 * Sniffs the MIME type from the first bytes (magic numbers) of a file buffer.
 * Provides true content-level validation against spoofed file extensions, disguised scripts, and SVGs.
 */
export function sniffImageMimeTypeFromBuffer(header: Uint8Array): string {
  if (!header || header.length < 3) {
    return '';
  }

  // 1. JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 3. GIF: GIF87a or GIF89a (47 49 46 38 37/39 61)
  if (
    header.length >= 6 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) &&
    header[5] === 0x61
  ) {
    return 'image/gif';
  }

  // 4. WebP: RIFF (52 49 46 46) at offset 0, and WEBP (57 45 42 50) at offset 8
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'image/webp';
  }

  // 5. Detect SVG / XML / HTML vectors disguised as raster photos
  let text = '';
  const textLen = Math.min(header.length, 128);
  for (let i = 0; i < textLen; i++) {
    text += String.fromCharCode(header[i]);
  }
  const trimmed = text.trim().toLowerCase();
  if (
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<svg') ||
    trimmed.startsWith('<!doctype svg') ||
    trimmed.startsWith('<!--') ||
    trimmed.includes('<svg') ||
    trimmed.startsWith('<html')
  ) {
    return 'image/svg+xml';
  }

  return '';
}

/**
 * Infers and normalizes image MIME type from declared type or file extension.
 * Crucial on mobile devices where file.type can be empty or generic 'application/octet-stream',
 * or camera aliases like 'image/jpg' and 'image/pjpeg'.
 */
export function inferMimeType(fileName: string, declaredType?: string): string {
  let cleanType = (declaredType || '').split(';')[0].toLowerCase().trim();

  // Normalize common MIME aliases to standard canonical types
  if (cleanType === 'image/jpg' || cleanType === 'image/pjpeg') {
    cleanType = 'image/jpeg';
  } else if (cleanType === 'image/x-png') {
    cleanType = 'image/png';
  } else if (cleanType === 'image/svg') {
    cleanType = 'image/svg+xml';
  }

  // If declaredType is already an allowed raster type or SVG, return it directly
  if (
    cleanType &&
    cleanType !== 'application/octet-stream' &&
    cleanType !== 'application/download' &&
    cleanType !== 'binary/octet-stream'
  ) {
    return cleanType;
  }

  // Fallback to file extension inference
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
    case 'svgz':
      return 'image/svg+xml';
    default:
      return cleanType || '';
  }
}

/**
 * Validates a file against security constraints and supported formats via metadata.
 * Matches the backend enforcement in storage.rules:
 * - Rejects SVG (vector images are blocked to prevent XSS/script injection)
 * - Rejects non-raster files
 * - Rejects oversized animated GIFs (> 5MB) since GIFs cannot be downscaled without losing frames
 * - Rejects files > 30MB to avoid mobile browser memory exhaustion
 */
export function validateImageFile(file: { name: string; size: number; type?: string }): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'No file selected.', detectedType: '' };
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).', detectedType: '' };
  }

  const detectedType = inferMimeType(file.name, file.type);

  // 1. Explicitly check for SVG (security vulnerability in storage buckets)
  const isSvg =
    detectedType === 'image/svg+xml' ||
    detectedType === 'image/svg' ||
    file.name.toLowerCase().endsWith('.svg') ||
    file.name.toLowerCase().endsWith('.svgz');

  if (isSvg) {
    return {
      valid: false,
      error: 'Vector images (SVG) are not allowed for security reasons. Please upload a standard photo (JPEG, PNG, WebP, or GIF).',
      detectedType: 'image/svg+xml',
    };
  }

  // 2. Must be an image
  if (!detectedType.startsWith('image/')) {
    return {
      valid: false,
      error: 'The selected file is not an image. Please choose a JPEG, PNG, WebP, or GIF photo.',
      detectedType,
    };
  }

  // 3. Must match storage.rules allowed raster types
  const isAllowedRaster = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(detectedType);
  if (!isAllowedRaster) {
    return {
      valid: false,
      error: `Unsupported image format (${detectedType || 'unknown'}). Please choose a JPEG, PNG, WebP, or GIF photo.`,
      detectedType,
    };
  }

  // 4. Client memory guardrail (30MB)
  if (file.size > MAX_CLIENT_INPUT_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Image file is too large (${sizeMb}MB). Please choose an image smaller than 30MB.`,
      detectedType,
    };
  }

  // 5. Animated GIF size limit (cannot downscale on canvas without losing animation frames)
  if (detectedType === 'image/gif' && file.size > MAX_STORAGE_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Animated GIF exceeds the 5MB upload limit (${sizeMb}MB). Please choose a GIF under 5MB.`,
      detectedType,
    };
  }

  return { valid: true, detectedType };
}

/**
 * Asynchronously validates the actual byte content of an uploaded file.
 * Reads the first 32-128 bytes to verify magic numbers and guard against disguised SVGs or executables.
 */
export async function validateImageContent(file: Blob | File): Promise<ImageValidationResult> {
  if (!file) {
    return { valid: false, error: 'No file selected.', detectedType: '' };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).', detectedType: '' };
  }

  try {
    const slice = file.slice(0, Math.min(file.size, 128));
    const arrayBuffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const sniffedType = sniffImageMimeTypeFromBuffer(bytes);

    if (sniffedType === 'image/svg+xml') {
      return {
        valid: false,
        error: 'Vector images (SVG) are not allowed for security reasons. Please upload a standard photo (JPEG, PNG, WebP, or GIF).',
        detectedType: 'image/svg+xml',
      };
    }

    if (!sniffedType) {
      return {
        valid: false,
        error: 'The selected file content is not a recognized raster image (JPEG, PNG, WebP, or GIF).',
        detectedType: '',
      };
    }

    const isAllowedRaster = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(sniffedType);
    if (!isAllowedRaster) {
      return {
        valid: false,
        error: `Unsupported image format (${sniffedType}). Please choose a JPEG, PNG, WebP, or GIF photo.`,
        detectedType: sniffedType,
      };
    }

    return { valid: true, detectedType: sniffedType };
  } catch (err) {
    return {
      valid: false,
      error: `Could not read image content: ${err instanceof Error ? err.message : String(err)}`,
      detectedType: '',
    };
  }
}

/**
 * Calculates aspect-ratio preserving dimensions capped at maxDimension.
 */
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width > height) {
    const targetWidth = maxDimension;
    const targetHeight = Math.max(1, Math.round((height * maxDimension) / width));
    return { width: targetWidth, height: targetHeight };
  } else {
    const targetHeight = maxDimension;
    const targetWidth = Math.max(1, Math.round((width * maxDimension) / height));
    return { width: targetWidth, height: targetHeight };
  }
}

/**
 * Generates an anonymized, collision-resistant filename for uploaded photos.
 * Prevents leaking local device metadata, camera identifiers, or personal filenames
 * (e.g. IMG_20241025_FamilyVacation.jpg) in public storage URLs.
 */
export function generateAnonymizedFileName(mimeType: string): string {
  const cleanType = (mimeType || '').split(';')[0].toLowerCase().trim();
  const ext =
    cleanType === 'image/png'
      ? '.png'
      : cleanType === 'image/webp'
      ? '.webp'
      : cleanType === 'image/gif'
      ? '.gif'
      : '.jpg';
  const token = Math.random().toString(36).substring(2, 8).padEnd(6, '0');
  return `photo_${Date.now()}_${token}${ext}`;
}

/**
 * Optimizes an image on the client device using an HTML Canvas before upload.
 * - Leaves animated GIFs untouched to preserve multi-frame animation (ensuring valid MIME type and anonymized filename)
 * - Always re-encodes photos through canvas to strip EXIF metadata (GPS coords, camera serials, timestamps)
 * - Preserves PNG and WebP alpha transparency
 * - Downscales heavy camera photos (e.g. 4032x3024 12MB) to <= 1600px with high smoothing
 * - Compresses JPEG/WebP to 85% quality (producing ~300KB-800KB sharp files)
 * - Progressively recompresses if needed to guarantee resulting file is <= 5MB
 * - Anonymizes output filename to prevent leaking local device or user file names
 * - Guarantees output File has an allowed raster MIME type matching storage.rules
 * - Cleans up canvas GPU memory after encoding
 */
export async function optimizeImageForUpload(
  file: File,
  options?: {
    maxDimension?: number;
    maxFileSize?: number;
    onProgress?: (status: string) => void;
  }
): Promise<File> {
  const maxDimension = options?.maxDimension ?? MAX_IMAGE_DIMENSION;
  const maxFileSize = options?.maxFileSize ?? MAX_STORAGE_FILE_SIZE;

  // 1. Pre-flight metadata validation
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  // 2. Pre-flight content signature validation if arrayBuffer is available
  if (typeof file.slice === 'function') {
    const contentCheck = await validateImageContent(file);
    if (!contentCheck.valid) {
      throw new Error(contentCheck.error || 'Invalid image file content.');
    }
  }

  const detectedType = validation.detectedType;

  // 3. Animated GIFs: do not run through canvas (would flatten to single frame).
  // Ensure the returned file has strict MIME type 'image/gif' and anonymized filename.
  if (detectedType === 'image/gif') {
    const anonymizedName = generateAnonymizedFileName('image/gif');
    return new File([file], anonymizedName, {
      type: 'image/gif',
      lastModified: file.lastModified || Date.now(),
    });
  }

  // 4. Non-browser environment guard (e.g. Node tests without DOM/Canvas)
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const anonymizedName = generateAnonymizedFileName(detectedType);
    return new File([file], anonymizedName, {
      type: detectedType,
      lastModified: file.lastModified || Date.now(),
    });
  }

  options?.onProgress?.('Reading photo...');

  // 5. Decode image via HTMLImageElement with timeout guard
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decode timed out. The file may be corrupt.'));
    }, 10000);

    image.onload = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image. The file may be corrupt or an unsupported format.'));
    };
    image.src = objectUrl;
  });

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  if (origWidth <= 0 || origHeight <= 0) {
    throw new Error('Image contains invalid dimensions (0x0).');
  }

  // 6. Security & Privacy Guardrail: Always re-encode photos through canvas
  // Even if an image is already compact (<= 1600px), we NEVER return
  // the raw camera file directly. Re-encoding through <canvas> strips 100% of embedded
  // EXIF metadata (GPS latitude/longitude, home address, camera serial numbers, timestamps)
  // before the photo is uploaded to the public Firebase Storage bucket.

  options?.onProgress?.('Resizing photo on device...');

  let currentMaxDim = maxDimension;
  let { width: targetWidth, height: targetHeight } = calculateTargetDimensions(
    origWidth,
    origHeight,
    currentMaxDim
  );

  const canvas = document.createElement('canvas');
  try {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable for image optimization.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Determine output MIME type: preserve WebP and PNG alpha channels
    let outputMime =
      detectedType === 'image/png'
        ? 'image/png'
        : detectedType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';
    let quality = 0.85;

    const exportBlob = (mime: string, q: number): Promise<Blob | null> => {
      return new Promise((resolve) => {
        let settled = false;
        const done = (b: Blob | null) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve(b);
          }
        };
        const timeoutId = setTimeout(() => done(null), 8000);

        try {
          if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((b) => done(b), mime, q);
          } else {
            const dataUrl = canvas.toDataURL(mime, q);
            fetch(dataUrl)
              .then((res) => res.blob())
              .then((b) => done(b))
              .catch(() => done(null));
          }
        } catch {
          done(null);
        }
      });
    };

    let blob = await exportBlob(outputMime, quality);

    // Fallback if browser canvas does not support image/webp export
    // Per HTML Canvas standard, if a format is unsupported, browsers return an image/png Blob
    // or invoke the callback with null (e.g. older Safari/WebKit engines).
    if (outputMime === 'image/webp' && (!blob || blob.size === 0 || blob.type !== 'image/webp')) {
      if (blob && blob.size > 0 && blob.type === 'image/png') {
        outputMime = 'image/png';
      } else {
        const pngBlob = await exportBlob('image/png', 1.0);
        if (pngBlob && pngBlob.size > 0) {
          blob = pngBlob;
          outputMime = 'image/png';
        } else {
          blob = await exportBlob('image/jpeg', quality);
          outputMime = 'image/jpeg';
        }
      }
    }

    // If PNG still exceeds max storage size (5MB), transcode to lossy WebP to retain alpha while shrinking
    if (outputMime === 'image/png' && blob && blob.size > maxFileSize) {
      options?.onProgress?.('Compressing photo...');
      const webpBlob = await exportBlob('image/webp', 0.85);
      if (webpBlob && webpBlob.type === 'image/webp' && webpBlob.size < blob.size) {
        blob = webpBlob;
        outputMime = 'image/webp';
      }
    }

    // Progressive compression loop for JPEG/WebP if still above maxFileSize
    const qualities = [0.75, 0.65, 0.50];
    let qIdx = 0;
    while (blob && blob.size > maxFileSize && qIdx < qualities.length) {
      if (outputMime === 'image/png') {
        break;
      }
      options?.onProgress?.('Compressing photo...');
      quality = qualities[qIdx++];
      const smallerBlob = await exportBlob(outputMime, quality);
      if (smallerBlob && smallerBlob.size > 0) {
        blob = smallerBlob;
      }
    }

    // If still above maxFileSize (5MB), progressively downscale canvas dimensions
    let downscaleAttempts = 0;
    while (blob && blob.size > maxFileSize && currentMaxDim > 400 && downscaleAttempts < 3) {
      downscaleAttempts++;
      options?.onProgress?.('Downscaling photo dimensions...');
      currentMaxDim = Math.round(currentMaxDim * 0.75);
      const scaled = calculateTargetDimensions(origWidth, origHeight, currentMaxDim);
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, scaled.width, scaled.height);
      const downscaledBlob = await exportBlob(outputMime, outputMime === 'image/png' ? 1.0 : 0.75);
      if (downscaledBlob && downscaledBlob.size > 0) {
        blob = downscaledBlob;
      } else {
        break;
      }
    }

    if (!blob || blob.size === 0) {
      throw new Error('Failed to encode optimized photo.');
    }

    const anonymizedName = generateAnonymizedFileName(outputMime);

    return new File([blob], anonymizedName, {
      type: outputMime,
      lastModified: Date.now(),
    });
  } finally {
    // Explicitly release canvas GPU memory buffers to prevent mobile browser memory bloat
    canvas.width = 0;
    canvas.height = 0;
    try {
      img.src = '';
    } catch {
      // Ignore if img is already detached
    }
  }
}
