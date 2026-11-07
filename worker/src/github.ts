/**
 * GitHub Contents API Handler for Doodlebug
 * Directly commits generated HTML into canvas.html and uploaded photos into img/
 * on the public GitHub Pages repository.
 */

import {
  Env,
  GitHubRepoConfig,
  PublishRequest,
  PublishResponse,
  UploadRequest,
  UploadResponse,
} from './types';

export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB limit

/**
 * Extracts GitHub repository configuration from environment
 */
export function getGitHubConfig(env: Env): GitHubRepoConfig {
  if (env.GITHUB_REPO_CONFIG) {
    try {
      const parsed = typeof env.GITHUB_REPO_CONFIG === 'string' 
        ? JSON.parse(env.GITHUB_REPO_CONFIG) 
        : env.GITHUB_REPO_CONFIG;
      return {
        owner: parsed.owner || env.GITHUB_OWNER || '',
        repo: parsed.repo || env.GITHUB_REPO || '',
        branch: parsed.branch || env.GITHUB_BRANCH || 'main',
        canvasPath: parsed.canvasPath || env.GITHUB_CANVAS_PATH || 'canvas.html',
        committerName: parsed.committerName || env.GITHUB_COMMITTER_NAME || 'Kieran Patton',
        committerEmail: parsed.committerEmail || env.GITHUB_COMMITTER_EMAIL || `${env.GITHUB_OWNER || 'kieranpatton01'}@users.noreply.github.com`,
      };
    } catch (e) {
      // Fall through to individual vars if JSON parse fails
    }
  }

  return {
    owner: env.GITHUB_OWNER || '',
    repo: env.GITHUB_REPO || '',
    branch: env.GITHUB_BRANCH || 'main',
    canvasPath: env.GITHUB_CANVAS_PATH || 'canvas.html',
    committerName: env.GITHUB_COMMITTER_NAME || 'Kieran Patton',
    committerEmail: env.GITHUB_COMMITTER_EMAIL || `${env.GITHUB_OWNER || 'kieranpatton01'}@users.noreply.github.com`,
  };
}

/**
 * UTF-8 safe Base64 encoder for Web Crypto / Cloudflare Workers
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Validates Base64 image data, verifies <= 5MB byte length, and sniffs binary magic bytes
 * to guarantee only safe raster images (JPEG, PNG, WebP, GIF) are committed to img/.
 */
export function sniffRasterMimeTypeFromBase64(rawInput: string): {
  valid: boolean;
  cleanBase64: string;
  mimeType: string;
  ext: string;
  byteLength: number;
  error?: string;
} {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, cleanBase64: '', mimeType: '', ext: '', byteLength: 0, error: 'Missing required field: dataBase64' };
  }

  let cleanBase64 = rawInput.trim();
  if (cleanBase64.includes(';base64,')) {
    const parts = cleanBase64.split(';base64,');
    cleanBase64 = parts[parts.length - 1];
  } else if (cleanBase64.startsWith('data:')) {
    return { valid: false, cleanBase64: '', mimeType: '', ext: '', byteLength: 0, error: 'Invalid data URL: must be base64 encoded' };
  }

  cleanBase64 = cleanBase64.replace(/\s+/g, '');
  if (!cleanBase64) {
    return { valid: false, cleanBase64: '', mimeType: '', ext: '', byteLength: 0, error: 'Image payload is empty' };
  }

  const padding = cleanBase64.endsWith('==') ? 2 : cleanBase64.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((cleanBase64.length * 3) / 4) - padding;

  if (byteLength <= 0) {
    return { valid: false, cleanBase64: '', mimeType: '', ext: '', byteLength: 0, error: 'Image payload is empty (0 bytes)' };
  }

  if (byteLength > MAX_UPLOAD_IMAGE_BYTES) {
    const sizeMb = (byteLength / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      cleanBase64: '',
      mimeType: '',
      ext: '',
      byteLength,
      error: `Image exceeds the 5MB upload limit (${sizeMb}MB)`,
    };
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64) || cleanBase64.length % 4 !== 0) {
    return { valid: false, cleanBase64: '', mimeType: '', ext: '', byteLength: 0, error: 'Malformed Base64 image payload' };
  }

  // Decode the first 192 base64 chars (up to 144 bytes) to inspect magic numbers
  const headerSliceB64 = cleanBase64.slice(0, Math.min(cleanBase64.length, 192));
  let headerBinary = '';
  try {
    headerBinary = atob(headerSliceB64);
  } catch {
    return { valid: false, cleanBase64: '', mimeType: '', ext: '', byteLength, error: 'Failed to decode Base64 image header' };
  }

  const header = new Uint8Array(headerBinary.length);
  for (let i = 0; i < headerBinary.length; i++) {
    header[i] = headerBinary.charCodeAt(i);
  }

  // Check for disguised SVG / XML / HTML vectors
  let textSample = '';
  const sampleLen = Math.min(header.length, 128);
  for (let i = 0; i < sampleLen; i++) {
    textSample += String.fromCharCode(header[i]);
  }
  const trimmedText = textSample.trim().toLowerCase();
  if (
    trimmedText.startsWith('<?xml') ||
    trimmedText.startsWith('<svg') ||
    trimmedText.startsWith('<!doctype svg') ||
    trimmedText.startsWith('<!--') ||
    trimmedText.includes('<svg') ||
    trimmedText.startsWith('<html')
  ) {
    return {
      valid: false,
      cleanBase64: '',
      mimeType: 'image/svg+xml',
      ext: '.svg',
      byteLength,
      error: 'Vector images (SVG) are not allowed for security reasons. Please upload a raster photo (JPEG, PNG, WebP, or GIF).',
    };
  }

  // 1. JPEG: FF D8 FF
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return { valid: true, cleanBase64, mimeType: 'image/jpeg', ext: '.jpg', byteLength };
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
    return { valid: true, cleanBase64, mimeType: 'image/png', ext: '.png', byteLength };
  }

  // 3. GIF: GIF87a or GIF89a
  if (
    header.length >= 6 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) &&
    header[5] === 0x61
  ) {
    return { valid: true, cleanBase64, mimeType: 'image/gif', ext: '.gif', byteLength };
  }

  // 4. WebP: RIFF....WEBP
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
    return { valid: true, cleanBase64, mimeType: 'image/webp', ext: '.webp', byteLength };
  }

  return {
    valid: false,
    cleanBase64: '',
    mimeType: '',
    ext: '',
    byteLength,
    error: 'Unsupported image format: file content must be a valid JPEG, PNG, WebP, or GIF raster image.',
  };
}

/**
 * Resolves the canonical public website base URL for serving img/ assets
 */
export function getPublicSiteBaseUrl(env: Env): string {
  if (env.PUBLIC_SITE_URL && env.PUBLIC_SITE_URL.trim()) {
    return env.PUBLIC_SITE_URL.trim().replace(/\/+$/, '');
  }
  return 'https://islacowper.co.uk';
}

/**
 * Uploads a validated raster photo into the GitHub repository's img/ directory
 */
export async function uploadImageToGitHub(
  payload: UploadRequest,
  env: Env
): Promise<UploadResponse> {
  if (!env.GITHUB_PAT) {
    throw new Error('Missing GITHUB_PAT secret on Cloudflare Worker');
  }

  const config = getGitHubConfig(env);
  if (!config.owner || !config.repo) {
    throw new Error(
      `GitHub repository configuration incomplete: owner='${config.owner}', repo='${config.repo}'. Set GITHUB_OWNER and GITHUB_REPO or GITHUB_REPO_CONFIG.`
    );
  }

  const sniffed = sniffRasterMimeTypeFromBase64(payload.dataBase64);
  if (!sniffed.valid) {
    throw new Error(sniffed.error || 'Invalid image payload');
  }

  // Construct collision-resistant anonymized filename strictly under img/
  let stem = '';
  if (payload.fileName && typeof payload.fileName === 'string') {
    const base = payload.fileName.split(/[/\\]/).pop() || '';
    const m = base.match(/^(photo_\d+_[a-z0-9]{4,12})\.[a-z0-9]+$/i);
    if (m) {
      stem = m[1].toLowerCase();
    }
  }
  if (!stem) {
    const token = Math.random().toString(36).substring(2, 8).padEnd(6, '0');
    stem = `photo_${Date.now()}_${token}`;
  }

  const safeFileName = `${stem}${sniffed.ext}`;
  const repoImagePath = `img/${safeFileName}`;
  const encodedPath = `img/${encodeURIComponent(safeFileName)}`;

  const headers = {
    'Authorization': `Bearer ${env.GITHUB_PAT}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Doodlebug-CMS-Worker/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const fileUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`;
  const putUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;

  let existingSha: string | undefined = undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const commitBody: Record<string, unknown> = {
      message: `📸 Doodlebug photo upload (${safeFileName})`,
      content: sniffed.cleanBase64,
      branch: config.branch,
      committer: {
        name: config.committerName,
        email: config.committerEmail,
      },
      author: {
        name: config.committerName,
        email: config.committerEmail,
      },
    };

    if (existingSha) {
      commitBody.sha = existingSha;
    }

    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commitBody),
    });

    if (putRes.ok) {
      const putData = (await putRes.json()) as {
        commit?: { sha?: string };
      };
      const publicBase = getPublicSiteBaseUrl(env);
      return {
        success: true,
        url: `${publicBase}/img/${safeFileName}`,
        path: repoImagePath,
        commitSha: putData.commit?.sha || 'unknown',
      };
    }

    // If file already exists on first attempt (422 or 409), fetch existing SHA and retry once
    if ((putRes.status === 409 || putRes.status === 422) && attempt === 1) {
      const getRes = await fetch(fileUrl, { method: 'GET', headers });
      if (getRes.ok) {
        const fileData = (await getRes.json()) as { sha?: string };
        if (fileData.sha) {
          existingSha = fileData.sha;
          continue;
        }
      }
    }

    const errorText = await putRes.text();
    throw new Error(`GitHub Image Upload Error (${putRes.status}): ${errorText}`);
  }

  throw new Error('Failed to upload image to GitHub img/ folder');
}

/**
 * Removes old/unused Doodlebug uploaded photos (photo_*.<ext>) from the GitHub img/ folder
 * that are no longer referenced in the newly published canvas.html document.
 */
export async function cleanupUnusedGitHubImages(
  publishedHtml: string,
  env: Env
): Promise<{ deleted: string[] }> {
  if (!env.GITHUB_PAT) {
    return { deleted: [] };
  }

  const config = getGitHubConfig(env);
  if (!config.owner || !config.repo) {
    return { deleted: [] };
  }

  // Find all img/<filename> references in the published HTML
  const usedFiles = new Set<string>();
  const imgRefRegex = /\bimg\/([a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp|gif))\b/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRefRegex.exec(publishedHtml)) !== null) {
    usedFiles.add(match[1].toLowerCase());
  }

  const headers = {
    'Authorization': `Bearer ${env.GITHUB_PAT}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Doodlebug-CMS-Worker/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const dirUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/img?ref=${encodeURIComponent(config.branch)}`;
  const listRes = await fetch(dirUrl, { method: 'GET', headers });
  if (!listRes.ok) {
    return { deleted: [] };
  }

  const items = await listRes.json();
  if (!Array.isArray(items)) {
    return { deleted: [] };
  }

  const deleted: string[] = [];
  const unusedItems = items.filter(
    (item: { name?: string; type?: string; sha?: string }) =>
      item &&
      item.type === 'file' &&
      typeof item.name === 'string' &&
      typeof item.sha === 'string' &&
      item.name !== '.gitkeep' &&
      /^photo_[a-z0-9._-]+\.(?:jpg|jpeg|png|webp|gif)$/i.test(item.name) &&
      !usedFiles.has(item.name.toLowerCase())
  );

  // Cap deletions per publish call to avoid Worker subrequest exhaustion
  for (const item of unusedItems.slice(0, 10)) {
    const delUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/img/${encodeURIComponent(item.name)}`;
    const delRes = await fetch(delUrl, {
      method: 'DELETE',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `🧹 Doodlebug: remove unused photo (${item.name})`,
        sha: item.sha,
        branch: config.branch,
        committer: {
          name: config.committerName,
          email: config.committerEmail,
        },
        author: {
          name: config.committerName,
          email: config.committerEmail,
        },
      }),
    });

    if (delRes.ok) {
      deleted.push(item.name);
    }
  }

  return { deleted };
}

/**
 * Commits the approved HTML directly to the target GitHub repository
 */
export async function commitCanvasToGitHub(
  payload: PublishRequest,
  env: Env
): Promise<PublishResponse> {
  if (!env.GITHUB_PAT) {
    throw new Error('Missing GITHUB_PAT secret on Cloudflare Worker');
  }

  const config = getGitHubConfig(env);
  if (!config.owner || !config.repo) {
    throw new Error(
      `GitHub repository configuration incomplete: owner='${config.owner}', repo='${config.repo}'. Set GITHUB_OWNER and GITHUB_REPO or GITHUB_REPO_CONFIG.`
    );
  }

  if (!payload.html || typeof payload.html !== 'string' || !payload.html.trim()) {
    throw new Error('Empty or invalid HTML content received for publication');
  }

  if (payload.html.length > 1_000_000) {
    throw new Error('HTML content exceeds maximum allowed size of 1MB');
  }

  const headers = {
    'Authorization': `Bearer ${env.GITHUB_PAT}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Doodlebug-CMS-Worker/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const safeCanvasPath = config.canvasPath
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const fileUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${safeCanvasPath}?ref=${encodeURIComponent(config.branch)}`;
  const putUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${safeCanvasPath}`;
  const base64Content = utf8ToBase64(payload.html);

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Step 1: Check if file already exists to get its current blob SHA
    let existingSha: string | undefined = undefined;

    const getRes = await fetch(fileUrl, {
      method: 'GET',
      headers,
    });

    if (getRes.ok) {
      const fileData = (await getRes.json()) as { sha?: string };
      existingSha = fileData.sha;
    } else if (getRes.status === 404) {
      existingSha = undefined;
    } else if (getRes.status === 401 || getRes.status === 403) {
      const errorText = await getRes.text();
      throw new Error(`GitHub Authentication Error (${getRes.status}): PAT is invalid or lacks 'Contents: Read and Write' scope. Details: ${errorText}`);
    } else {
      const errorText = await getRes.text();
      throw new Error(`Failed to check existing file on GitHub (${getRes.status}): ${errorText}`);
    }

    // Step 2: PUT /repos/{owner}/{repo}/contents/{path}
    const commitBody: Record<string, unknown> = {
      message: payload.commitMessage || '🎨 Doodlebug update via Vibecode (canvas.html)',
      content: base64Content,
      branch: config.branch,
      committer: {
        name: config.committerName,
        email: config.committerEmail,
      },
      author: {
        name: config.committerName,
        email: config.committerEmail,
      },
    };

    if (existingSha) {
      commitBody.sha = existingSha;
    }

    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commitBody),
    });

    if (putRes.ok) {
      const putData = (await putRes.json()) as {
        commit?: { sha?: string };
        content?: { html_url?: string };
      };

      return {
        success: true,
        commitSha: putData.commit?.sha || 'unknown',
        htmlUrl: putData.content?.html_url || `https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${config.canvasPath}`,
        path: config.canvasPath,
        branch: config.branch,
      };
    }

    if (putRes.status === 409 && attempt < maxAttempts) {
      // 409 Conflict: concurrent edit changed SHA. Retry with fresh SHA.
      await new Promise((r) => setTimeout(r, 300 * attempt));
      continue;
    }

    const errorText = await putRes.text();
    lastError = new Error(`GitHub Commit Error (${putRes.status}): ${errorText}`);
    break;
  }

  throw lastError || new Error('Failed to commit canvas to GitHub');
}
