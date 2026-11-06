/**
 * Doodlebug Cloudflare Worker Secure Gateway
 * 
 * Endpoints:
 * - OPTIONS *              -> CORS preflight handler
 * - GET /health            -> Health check & config summary
 * - POST /api/generate     -> Auth validation + Gemini Flash multimodal code generation
 * - POST /api/publish      -> Auth validation + GitHub REST API commit to canvas.html
 */

import { Env, GenerateRequest, PublishRequest } from './types';
import { verifyFirebaseToken } from './auth';
import { generateCanvasFromDoodle } from './gemini';
import { commitCanvasToGitHub, getGitHubConfig } from './github';
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
 * Validates external image URLs: HTTPS only and restricted to Firebase Storage or approved photo CDN
 */
export function isValidImageUrl(url: string, env: Env): boolean {
  if (typeof url !== 'string' || url.length > 1000) return false;
  if (!url.startsWith('https://')) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

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

    // If FIREBASE_PROJECT_ID is configured, restrict strictly to the project's own storage bucket
    const projectId = env.FIREBASE_PROJECT_ID;
    if (projectId) {
      const allowedBuckets = [
        `${projectId}.appspot.com`,
        `${projectId}.firebasestorage.app`,
        projectId,
      ];

      if (hostname === 'firebasestorage.googleapis.com') {
        return allowedBuckets.some(
          (b) => pathname === `/v0/b/${b}` || pathname.startsWith(`/v0/b/${b}/`)
        );
      }
      if (hostname === 'storage.googleapis.com') {
        return allowedBuckets.some(
          (b) => pathname === `/${b}` || pathname.startsWith(`/${b}/`)
        );
      }
      if (hostname === `${projectId}.firebasestorage.app`) {
        return true;
      }
      return false;
    }

    // Generic Firebase Storage official hosts if FIREBASE_PROJECT_ID is not configured
    if (
      hostname === 'firebasestorage.googleapis.com' ||
      hostname === 'storage.googleapis.com' ||
      hostname.endsWith('.firebasestorage.app')
    ) {
      return true;
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
    if (pathname === '/api/generate' || pathname === '/api/publish') {
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
              { error: 'Invalid imageUrl in list: must be HTTPS and hosted on Firebase Storage or approved photo CDN' },
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

    // 4. POST /api/publish - Commit approved HTML to canvas.html on GitHub
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
        return jsonResponse(publishResult, 200, env, {}, origin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: `Publication failed: ${message}` }, 502, env, {}, origin);
      }
    }

    // 5. Route Not Found
    return jsonResponse(
      { error: `Route not found: ${method} ${pathname}` },
      404,
      env,
      {},
      origin
    );
  },
};
