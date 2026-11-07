/**
 * Doodlebug Cloudflare Worker Secure Gateway
 * 
 * Endpoints:
 * - OPTIONS *              -> CORS preflight handler
 * - GET /health            -> Health check & config summary
 * - POST /api/generate     -> Auth validation + Gemini Flash multimodal code generation
 * - POST /api/publish      -> Auth validation + GitHub REST API commit to canvas.html (+ img/ cleanup)
 * - POST /api/upload       -> Auth validation + GitHub REST API commit of raster photo to img/
 * - POST /api/assist       -> Auth validation + Gemini Nerd Assist canvas layout generator
 */

import { Env, GenerateRequest, PublishRequest, AssistRequest, UploadRequest } from './types';
import { verifyFirebaseToken } from './auth';
import { generateCanvasFromDoodle, generateCanvasAssistPlan } from './gemini';
import {
  commitCanvasToGitHub,
  getGitHubConfig,
  uploadImageToGitHub,
  cleanupUnusedGitHubImages,
  sniffRasterMimeTypeFromBase64,
} from './github';
import { validateCanvasHtml } from './validator';

export { validateCanvasHtml };

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Checks in-memory rate limits per client/UID
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  // Prune expired buckets if store grows large to prevent memory leaks in long-lived isolates
  if (rateLimitStore.size > 500) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt <= now) {
        rateLimitStore.delete(k);
      }
    }
  }

  const bucket = rateLimitStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= maxRequests) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Validates external image URLs: HTTPS only and restricted to the GitHub img/ folder or approved photo/GIF CDNs
 */
export function isValidImageUrl(url: string, env: Env): boolean {
  if (typeof url !== 'string' || url.length > 1000) return false;
  if (!url.startsWith('https://')) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password || parsed.port) return false;

    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    let decodedPathname = pathname;
    try {
      decodedPathname = decodeURIComponent(pathname);
    } catch {
      return false;
    }

    if (
      pathname.includes('..') ||
      pathname.includes('\\') ||
      decodedPathname.includes('..') ||
      decodedPathname.includes('\\')
    ) {
      return false;
    }

    // Supported aesthetic photo & GIF CDNs (Unsplash, Tenor, Giphy used in Doodlebug PWA tray)
    if (
      hostname === 'images.unsplash.com' ||
      hostname === 'media.tenor.com' ||
      hostname === 'media1.tenor.com' ||
      hostname === 'c.tenor.com' ||
      hostname.endsWith('.tenor.com') ||
      hostname === 'media.giphy.com' ||
      hostname === 'i.giphy.com' ||
      hostname.endsWith('.giphy.com')
    ) {
      return true;
    }

    // Allow mock/dev host ONLY when dev bypass auth is explicitly enabled AND not in production
    if (
      env.DEV_BYPASS_AUTH === 'true' &&
      env.ENVIRONMENT !== 'production' &&
      (hostname === 'example.com' || hostname.endsWith('.example.com'))
    ) {
      return true;
    }

    // GitHub img/ URLs must not include query strings or hash fragments
    if (parsed.search || parsed.hash) {
      return false;
    }

    const safeImgFileRegex = /^\/img\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp|gif)$/i;

    // 1. Live showcase custom domain (https://islacowper.co.uk/img/...)
    if (hostname === 'islacowper.co.uk' || hostname === 'www.islacowper.co.uk') {
      return safeImgFileRegex.test(pathname);
    }

    // 2. Configured PUBLIC_SITE_URL domain if set
    if (env.PUBLIC_SITE_URL) {
      try {
        const pubUrl = new URL(env.PUBLIC_SITE_URL);
        if (pubUrl.protocol === 'https:' && hostname === pubUrl.hostname.toLowerCase()) {
          const basePath = pubUrl.pathname.replace(/\/+$/, '');
          if (basePath) {
            if (pathname.startsWith(`${basePath}/`)) {
              const relPath = pathname.slice(basePath.length);
              if (safeImgFileRegex.test(relPath)) {
                return true;
              }
            }
          } else if (safeImgFileRegex.test(pathname)) {
            return true;
          }
        }
      } catch {
        // ignore malformed PUBLIC_SITE_URL
      }
    }

    // 3. GitHub Pages & raw.githubusercontent.com strictly scoped to configured owner/repo img/ folder
    const ghConfig = getGitHubConfig(env);
    const owner = (ghConfig.owner || 'kieranpatton01').toLowerCase();
    const repo = (ghConfig.repo || 'doodlebug').toLowerCase();
    const lowerPath = pathname.toLowerCase();

    if (hostname === `${owner}.github.io`) {
      if (lowerPath.startsWith(`/${repo}/img/`)) {
        const subPath = pathname.slice(repo.length + 1);
        return safeImgFileRegex.test(subPath);
      }
      if (repo === `${owner}.github.io`) {
        return safeImgFileRegex.test(pathname);
      }
      return false;
    }

    if (hostname === 'raw.githubusercontent.com') {
      const prefix = `/${owner}/${repo}/`;
      if (lowerPath.startsWith(prefix)) {
        const rest = pathname.slice(prefix.length); // <branch>/img/<file>
        const slashIdx = rest.indexOf('/');
        if (slashIdx > 0) {
          const branchAndSubPath = rest.slice(slashIdx);
          return safeImgFileRegex.test(branchAndSubPath);
        }
      }
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Checks whether an origin is a local or private network development origin
 */
export function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

/**
 * Generates CORS headers for all responses
 */
export function getCorsHeaders(env: Env, requestOrigin?: string | null): HeadersInit {
  const configured = env.CORS_ORIGIN || '*';
  let allowOrigin = '*';

  if (configured === '*') {
    allowOrigin = '*';
  } else {
    const origins = configured.split(',').map((o) => o.trim()).filter(Boolean);
    if (
      requestOrigin &&
      (origins.includes(requestOrigin) || origins.includes('*') || isLocalDevOrigin(requestOrigin))
    ) {
      allowOrigin = requestOrigin;
    } else {
      // When requestOrigin does not match the configured list, return the primary configured origin
      allowOrigin = origins[0] || 'null';
    }
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  if (configured !== '*') {
    headers['Vary'] = 'Origin';
  }

  return headers;
}

/**
 * Standard JSON response helper
 */
export function jsonResponse(
  data: unknown,
  status: number,
  env: Env,
  extraHeaders: Record<string, string> = {},
  requestOrigin?: string | null
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(env, requestOrigin),
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin');

    // 1. Handle CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(env, origin),
      });
    }

    // 2. Health Check (Redacted to avoid exposing private repo info or secret status)
    if (pathname === '/health' || pathname === '/api/health') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'doodlebug-gateway',
          timestamp: new Date().toISOString(),
        },
        200,
        env,
        {},
        origin
      );
    }

    // Pre-auth rate limiting: max 60 requests per minute per IP or client to protect worker against unauthenticated floods
    if (
      pathname === '/api/generate' ||
      pathname === '/api/publish' ||
      pathname === '/api/upload' ||
      pathname === '/api/assist'
    ) {
      const cfIp = request.headers.get('cf-connecting-ip');
      const xff = request.headers.get('x-forwarded-for');
      const clientIp = cfIp || (xff ? xff.split(',')[0].trim() : '') || request.headers.get('x-real-ip') || '';

      let rateLimitKey: string;
      if (clientIp) {
        rateLimitKey = `ip:${clientIp}`;
      } else {
        // When client IP headers are absent (e.g. local dev, custom proxies, direct invocations),
        // avoid collapsing all distinct clients into a single shared bucket.
        const auth = request.headers.get('Authorization') || '';
        const clientId = request.headers.get('x-client-id') || request.headers.get('x-forwarded-host') || '';
        const userAgent = request.headers.get('User-Agent') || '';
        if (auth) {
          rateLimitKey = `auth:${auth.slice(-32)}`;
        } else if (clientId) {
          rateLimitKey = `client:${clientId}`;
        } else if (userAgent) {
          rateLimitKey = `ua:${userAgent}:${origin || 'direct'}`;
        } else {
          rateLimitKey = `client:${origin || 'direct-client'}`;
        }
      }

      const ipLimit = checkRateLimit(rateLimitKey, 60, 60_000);
      if (!ipLimit.allowed) {
        return jsonResponse(
          { error: `Too many requests from your IP or client. Please wait ${ipLimit.retryAfterSeconds} seconds.` },
          429,
          env,
          { 'Retry-After': String(ipLimit.retryAfterSeconds) },
          origin
        );
      }
    }

    // 3. POST /api/generate - Multimodal Doodle-to-Code Generation
    if (pathname === '/api/generate') {
      if (method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, env, {}, origin);
      }

      // Authenticate & lockdown identity
      const authResult = await verifyFirebaseToken(request.headers.get('Authorization'), env);
      if (!authResult.valid) {
        return jsonResponse(
          { error: authResult.error || 'Unauthorized' },
          authResult.statusCode || 401,
          env,
          {},
          origin
        );
      }

      // Rate limiting: max 10 generation requests per minute per UID to bound Gemini costs
      const rateLimitKey = `generate:${authResult.uid || 'anon'}`;
      const limitResult = checkRateLimit(rateLimitKey, 10, 60_000);
      if (!limitResult.allowed) {
        return jsonResponse(
          { error: `Too many generation requests. Please wait ${limitResult.retryAfterSeconds} seconds before generating again.` },
          429,
          env,
          { 'Retry-After': String(limitResult.retryAfterSeconds) },
          origin
        );
      }

      // Parse and validate payload
      let body: GenerateRequest;
      try {
        body = (await request.json()) as GenerateRequest;
      } catch (err) {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400, env, {}, origin);
      }

      if (!body.snapshotBase64 || typeof body.snapshotBase64 !== 'string') {
        return jsonResponse(
          { error: 'Missing required field: snapshotBase64' },
          400,
          env,
          {},
          origin
        );
      }

      if (body.snapshotBase64.length > 10_000_000) {
        return jsonResponse(
          { error: 'snapshotBase64 exceeds maximum size limit (10MB)' },
          400,
          env,
          {},
          origin
        );
      }

      if (body.imageUrls && Array.isArray(body.imageUrls)) {
        if (body.imageUrls.length > 20) {
          return jsonResponse({ error: 'Too many imageUrls attached (max 20)' }, 400, env, {}, origin);
        }
        for (const imgUrl of body.imageUrls) {
          if (!isValidImageUrl(imgUrl, env)) {
            return jsonResponse(
              { error: 'Invalid imageUrl in list: must be HTTPS and hosted in the GitHub img/ folder or approved photo CDN' },
              400,
              env,
              {},
              origin
            );
          }
        }
      }

      if (body.notes && typeof body.notes === 'string' && body.notes.length > 4000) {
        return jsonResponse({ error: 'Notes exceed maximum length of 4000 characters' }, 400, env, {}, origin);
      }

      try {
        const generationResult = await generateCanvasFromDoodle(body, env);
        return jsonResponse(generationResult, 200, env, {}, origin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Worker Generate Error]:', message);
        return jsonResponse({ error: `Generation failed: ${message}` }, 502, env, {}, origin);
      }
    }

    // 4. POST /api/publish - Commit approved HTML to canvas.html on GitHub (+ clean up unused img/ photos)
    if (pathname === '/api/publish') {
      if (method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, env, {}, origin);
      }

      // Authenticate & lockdown identity
      const authResult = await verifyFirebaseToken(request.headers.get('Authorization'), env);
      if (!authResult.valid) {
        return jsonResponse(
          { error: authResult.error || 'Unauthorized' },
          authResult.statusCode || 401,
          env,
          {},
          origin
        );
      }

      // Rate limiting: max 15 publish requests per minute per UID
      const rateLimitKey = `publish:${authResult.uid || 'anon'}`;
      const limitResult = checkRateLimit(rateLimitKey, 15, 60_000);
      if (!limitResult.allowed) {
        return jsonResponse(
          { error: `Too many publish requests. Please wait ${limitResult.retryAfterSeconds} seconds.` },
          429,
          env,
          { 'Retry-After': String(limitResult.retryAfterSeconds) },
          origin
        );
      }

      // Parse and validate payload
      let body: PublishRequest;
      try {
        body = (await request.json()) as PublishRequest;
      } catch (err) {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400, env, {}, origin);
      }

      const htmlValidation = validateCanvasHtml(body.html);
      if (!htmlValidation.valid) {
        return jsonResponse({ error: htmlValidation.error }, 400, env, {}, origin);
      }

      if (body.commitMessage && typeof body.commitMessage === 'string' && body.commitMessage.length > 300) {
        return jsonResponse({ error: 'commitMessage exceeds maximum length (300 characters)' }, 400, env, {}, origin);
      }

      try {
        const publishResult = await commitCanvasToGitHub(body, env);
        // Best-effort cleanup of old/unused images in img/ not referenced by the newly published canvas.html
        await cleanupUnusedGitHubImages(body.html, env).catch(() => {});
        return jsonResponse(publishResult, 200, env, {}, origin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: `Publication failed: ${message}` }, 502, env, {}, origin);
      }
    }

    // 5. POST /api/upload - Commit optimized raster photo into GitHub img/ folder
    if (pathname === '/api/upload') {
      if (method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, env, {}, origin);
      }

      const authResult = await verifyFirebaseToken(request.headers.get('Authorization'), env);
      if (!authResult.valid) {
        return jsonResponse(
          { error: authResult.error || 'Unauthorized' },
          authResult.statusCode || 401,
          env,
          {},
          origin
        );
      }

      const rateLimitKey = `upload:${authResult.uid || 'anon'}`;
      const limitResult = checkRateLimit(rateLimitKey, 20, 60_000);
      if (!limitResult.allowed) {
        return jsonResponse(
          { error: `Too many photo uploads. Please wait ${limitResult.retryAfterSeconds} seconds.` },
          429,
          env,
          { 'Retry-After': String(limitResult.retryAfterSeconds) },
          origin
        );
      }

      let body: UploadRequest;
      try {
        body = (await request.json()) as UploadRequest;
      } catch {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400, env, {}, origin);
      }

      if (!body.dataBase64 || typeof body.dataBase64 !== 'string') {
        return jsonResponse({ error: 'Missing required field: dataBase64' }, 400, env, {}, origin);
      }

      const sniffed = sniffRasterMimeTypeFromBase64(body.dataBase64);
      if (!sniffed.valid) {
        return jsonResponse({ error: sniffed.error || 'Invalid image payload' }, 400, env, {}, origin);
      }

      try {
        const uploadResult = await uploadImageToGitHub(body, env);
        return jsonResponse(uploadResult, 200, env, {}, origin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: `Photo upload failed: ${message}` }, 502, env, {}, origin);
      }
    }

    // 6. POST /api/assist - AI Nerd Assist Canvas Layout Generator
    if (pathname === '/api/assist') {
      if (method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, env, {}, origin);
      }

      const authResult = await verifyFirebaseToken(request.headers.get('Authorization'), env);
      if (!authResult.valid) {
        return jsonResponse(
          { error: authResult.error || 'Unauthorized' },
          authResult.statusCode || 401,
          env,
          {},
          origin
        );
      }

      const rateLimitKey = `assist:${authResult.uid || 'anon'}`;
      const limitResult = checkRateLimit(rateLimitKey, 15, 60_000);
      if (!limitResult.allowed) {
        return jsonResponse(
          { error: `Too many Nerd Assist requests. Please wait ${limitResult.retryAfterSeconds} seconds.` },
          429,
          env,
          { 'Retry-After': String(limitResult.retryAfterSeconds) },
          origin
        );
      }

      let body: AssistRequest;
      try {
        body = (await request.json()) as AssistRequest;
      } catch {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400, env, {}, origin);
      }

      if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
        return jsonResponse({ error: 'Missing required field: prompt' }, 400, env, {}, origin);
      }

      try {
        const assistPlan = await generateCanvasAssistPlan(body, env);
        return jsonResponse(assistPlan, 200, env, {}, origin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: `Nerd Assist failed: ${message}` }, 502, env, {}, origin);
      }
    }

    // 7. Route Not Found
    return jsonResponse(
      { error: `Route not found: ${method} ${pathname}` },
      404,
      env,
      {},
      origin
    );
  },
};
