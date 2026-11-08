/**
 * Standalone Automated Test Runner for Doodlebug Worker
 * Tests the REAL compiled worker source code using Node.js built-in WebCrypto, assertions, and fetch.
 */

const assert = require('assert');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 DOODLEBUG WORKER CONTRACT & UNIT TEST SUITE');
console.log('═══════════════════════════════════════════════════════\n');

// Step 0: Compile worker/src TypeScript into worker/dist-test
console.log('📦 Compiling worker/src TypeScript source files...');
const workerDir = path.resolve(__dirname, '..');
execSync(
  'npx tsc src/auth.ts src/gemini.ts src/github.ts src/index.ts src/types.ts src/validator.ts --outDir dist-test --target es2022 --module commonjs --skipLibCheck --moduleResolution node',
  { cwd: workerDir, stdio: 'pipe' }
);
console.log('✅ Compilation successful. Testing real compiled modules from dist-test/.\n');

const { verifyFirebaseToken, setCachedJwks } = require('../dist-test/auth.js');
const { buildGeminiPrompt, sanitizeHtmlResponse, generateCanvasFromDoodle, generateCanvasAssistPlan } = require('../dist-test/gemini.js');
const {
  getGitHubConfig,
  utf8ToBase64,
  commitCanvasToGitHub,
  uploadImageToGitHub,
  cleanupUnusedGitHubImages,
  sniffRasterMimeTypeFromBase64,
} = require('../dist-test/github.js');
const workerDefault = require('../dist-test/index.js').default;
const { getCorsHeaders, checkRateLimit, resetRateLimits, isValidImageUrl, validateCanvasHtml } = require('../dist-test/index.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlEncodeBuffer(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function runAllTests() {
  // Generate real RSA keypair for testing RS256 token verification
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const jwk = publicKey.export({ format: 'jwk' });
  const testKid = 'doodlebug-test-key-id-1';
  jwk.kid = testKid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  function createSignedJwt(payload, kid = testKid, customKey = privateKey) {
    const header = { alg: 'RS256', kid: kid, typ: 'JWT' };
    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = signer.sign(customKey);
    const sigB64 = base64UrlEncodeBuffer(signature);

    return `${signingInput}.${sigB64}`;
  }

  const testEnv = {
    ALLOWED_FIREBASE_UID: 'gf-authorized-uid-12345',
    FIREBASE_PROJECT_ID: 'doodlebug-pwa-demo',
    GEMINI_API_KEY: 'test-gemini-key',
    GITHUB_PAT: 'github_pat_test_12345',
    GITHUB_OWNER: 'testowner',
    GITHUB_REPO: 'testrepo',
    GITHUB_BRANCH: 'main',
    GITHUB_CANVAS_PATH: 'canvas.html',
    DEV_BYPASS_AUTH: 'false',
  };

  // ==========================================
  // SECTION 1: AUTHENTICATION & IDENTITY TESTS (REAL WebCrypto)
  // ==========================================
  console.log('--- 1. Authentication & Identity Lockdown Tests (Real WebCrypto) ---');

  setCachedJwks([jwk]);

  await test('Rejects request without Authorization header (401)', async () => {
    const res = await verifyFirebaseToken(null, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('Rejects request with non-Bearer token (401)', async () => {
    const res = await verifyFirebaseToken('Basic 123456', testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('Rejects malformed JWT segments (401)', async () => {
    const res = await verifyFirebaseToken('Bearer invalid.token', testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('Rejects expired token (401)', async () => {
    const expiredPayload = {
      sub: testEnv.ALLOWED_FIREBASE_UID,
      aud: testEnv.FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = createSignedJwt(expiredPayload);
    const res = await verifyFirebaseToken(`Bearer ${token}`, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.match(res.error, /expired/i);
  });

  await test('Rejects audience mismatch (401)', async () => {
    const badAudPayload = {
      sub: testEnv.ALLOWED_FIREBASE_UID,
      aud: 'other-wrong-firebase-project',
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createSignedJwt(badAudPayload);
    const res = await verifyFirebaseToken(`Bearer ${token}`, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.match(res.error, /audience/i);
  });

  await test('IDENTITY LOCKDOWN: Rejects valid token with DISALLOWED UID (403 Forbidden)', async () => {
    const untrustedPayload = {
      sub: 'hacker-or-stranger-uid-999',
      aud: testEnv.FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createSignedJwt(untrustedPayload);
    const res = await verifyFirebaseToken(`Bearer ${token}`, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 403, 'Must return 403 Forbidden for unauthorized UID');
    assert.match(res.error, /Forbidden/i);
  });

  await test('Rejects token with forged cryptographic signature (401)', async () => {
    const otherKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const payload = {
      sub: testEnv.ALLOWED_FIREBASE_UID,
      aud: testEnv.FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const forgedToken = createSignedJwt(payload, testKid, otherKeyPair.privateKey);
    const res = await verifyFirebaseToken(`Bearer ${forgedToken}`, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('Accepts valid token with ALLOWED UID & valid WebCrypto signature (200 OK)', async () => {
    const validPayload = {
      sub: testEnv.ALLOWED_FIREBASE_UID,
      aud: testEnv.FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createSignedJwt(validPayload);
    const res = await verifyFirebaseToken(`Bearer ${token}`, testEnv);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.uid, testEnv.ALLOWED_FIREBASE_UID);
  });

  await test('DEV_BYPASS_AUTH allows mock token only for authorized UID', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const authOk = await verifyFirebaseToken('Bearer mock-token-uid-gf-authorized-uid-12345', devEnv);
    assert.strictEqual(authOk.valid, true);
    assert.strictEqual(authOk.uid, 'gf-authorized-uid-12345');

    const authBad = await verifyFirebaseToken('Bearer mock-token-uid-intruder-999', devEnv);
    assert.strictEqual(authBad.valid, false);
    assert.strictEqual(authBad.statusCode, 403);
  });

  await test('CRITICAL: Rejects request when FIREBASE_PROJECT_ID is unset/missing (500)', async () => {
    const envWithoutProjectId = { ...testEnv, FIREBASE_PROJECT_ID: '' };
    const validPayload = {
      sub: testEnv.ALLOWED_FIREBASE_UID,
      aud: testEnv.FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createSignedJwt(validPayload);
    const res = await verifyFirebaseToken(`Bearer ${token}`, envWithoutProjectId);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 500);
    assert.match(res.error, /FIREBASE_PROJECT_ID/);
  });

  await test('SIGNATURE FIRST: Rejects forged signature before checking UID (401)', async () => {
    const otherKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const payload = {
      sub: 'intruder-hacker-uid',
      aud: testEnv.FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const forgedToken = createSignedJwt(payload, testKid, otherKeyPair.privateKey);
    const res = await verifyFirebaseToken(`Bearer ${forgedToken}`, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401, 'Must reject with 401 on forged signature before UID check');
  });

  await test('ERROR SANITIZATION: Error message does not echo UID or expected audience', async () => {
    const disallowedPayload = {
      sub: 'secret-attacker-uid-9999',
      aud: 'secret-wrong-aud',
      iss: `https://securetoken.google.com/${testEnv.FIREBASE_PROJECT_ID}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createSignedJwt(disallowedPayload);
    const res = await verifyFirebaseToken(`Bearer ${token}`, testEnv);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error.includes('secret-attacker-uid-9999'), false);
    assert.strictEqual(res.error.includes(testEnv.FIREBASE_PROJECT_ID), false);
  });

  await test('THROTTLED REFETCH: Repeated tokens with unknown kid do not trigger multiple JWKS network fetches', async () => {
    let networkFetchCount = 0;
    const origFetch = global.fetch;
    global.fetch = async (url) => {
      if (String(url).includes('googleapis.com')) {
        networkFetchCount++;
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return origFetch(url);
    };

    try {
      // Simulate cache populated right now
      setCachedJwks([jwk], Date.now());

      const badKidHeader = { alg: 'RS256', kid: 'random-unknown-kid-1' };
      const badKidJwt1 = `${Buffer.from(JSON.stringify(badKidHeader)).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: testEnv.ALLOWED_FIREBASE_UID })).toString('base64url')}.sig`;
      
      const res1 = await verifyFirebaseToken(`Bearer ${badKidJwt1}`, testEnv);
      assert.strictEqual(res1.valid, false);
      assert.strictEqual(res1.statusCode, 401);
      assert.strictEqual(networkFetchCount, 0, 'Must NOT trigger network fetch when cache was refreshed within throttle window');

      const badKidHeader2 = { alg: 'RS256', kid: 'random-unknown-kid-2' };
      const badKidJwt2 = `${Buffer.from(JSON.stringify(badKidHeader2)).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: testEnv.ALLOWED_FIREBASE_UID })).toString('base64url')}.sig`;
      
      const res2 = await verifyFirebaseToken(`Bearer ${badKidJwt2}`, testEnv);
      assert.strictEqual(res2.valid, false);
      assert.strictEqual(res2.statusCode, 401);
      assert.strictEqual(networkFetchCount, 0, 'Subsequent attack requests within 1 minute must also be rejected without network fetch');
    } finally {
      global.fetch = origFetch;
      setCachedJwks([jwk]);
    }
  });

  // ==========================================
  // SECTION 2: GEMINI PROMPT & GUARDRAILS TESTS
  // ==========================================
  console.log('\n--- 2. Gemini System Prompt & Guardrails Tests ---');

  await test('Prompt enforces Self-Contained Document guardrail', () => {
    const prompt = buildGeminiPrompt('My cute dog', ['https://islacowper.co.uk/img/photo1.jpg']);
    assert.match(prompt, /<!DOCTYPE html>/i);
    assert.match(prompt, /<head>/i);
    assert.match(prompt, /<body>/i);
  });

  await test('Prompt enforces Tailwind CDN guardrail', () => {
    const prompt = buildGeminiPrompt('', []);
    assert.match(prompt, /cdn\.tailwindcss\.com/);
  });

  await test('Prompt enforces zero Base64 placeholder and embeds exact GitHub img/ URLs', () => {
    const photoUrls = [
      'https://islacowper.co.uk/img/photo_101_abc123.png',
      'https://islacowper.co.uk/img/photo_102_def456.jpg',
    ];
    const prompt = buildGeminiPrompt('Summer memory', photoUrls);
    assert.match(prompt, /NEVER use base64 placeholders/i);
    assert.match(prompt, new RegExp(photoUrls[0]));
    assert.match(prompt, new RegExp(photoUrls[1]));
  });

  await test('Prompt enforces Typography for cute/handwritten (Caveat/Kalam)', () => {
    const prompt = buildGeminiPrompt('', []);
    assert.match(prompt, /Caveat/i);
  });

  await test('Prompt enforces Micro-Interactions (hover:scale, transitions)', () => {
    const prompt = buildGeminiPrompt('', []);
    assert.match(prompt, /hover:scale/i);
  });

  await test('Prompt enforces No Toxic JavaScript guardrail', () => {
    const prompt = buildGeminiPrompt('', []);
    assert.match(prompt, /NO TOXIC JAVASCRIPT/i);
  });

  await test('Prompt enforces exact visual fidelity without website theming overrides', () => {
    const prompt = buildGeminiPrompt('', []);
    assert.match(prompt, /IDENTICAL/i);
    assert.match(prompt, /theming is completely disabled/i);
    assert.strictEqual(prompt.includes('CURRENT VIBE SELECTION'), false);
  });

  await test('Prompt enforces mobile-first design for mobile browser', () => {
    const prompt = buildGeminiPrompt('', []);
    assert.match(prompt, /mobile first/i);
    assert.match(prompt, /mobile browser/i);
    assert.match(prompt, /meta name="viewport"/i);
  });

  await test('Prompt retains user notes when called with single argument', () => {
    const prompt = buildGeminiPrompt('My cafe menu doodle');
    assert.match(prompt, /My cafe menu doodle/);
  });

  await test('Sanitizer automatically injects mobile viewport meta tag when missing', () => {
    const raw = '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Hello</h1></body></html>';
    const cleaned = sanitizeHtmlResponse(raw);
    assert.match(cleaned, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/i);
  });

  await test('Sanitizer strips markdown ```html and ``` code fences cleanly', () => {
    const raw = "```html\n<!DOCTYPE html><html><head><script src=\"https://cdn.tailwindcss.com\"></script></head><body><h1>Hello</h1></body></html>\n```";
    const cleaned = sanitizeHtmlResponse(raw);
    assert.strictEqual(cleaned.startsWith('```'), false);
    assert.strictEqual(cleaned.endsWith('```'), false);
    assert.match(cleaned, /<!DOCTYPE html>/);
  });

  await test('Sanitizer strips conversational LLM preambles and postambles', () => {
    const bt = '```';
    const raw = `Here is the requested component:\n${bt}html\n<!DOCTYPE html><html><head></head><body><h1>Lily's Scrapbook</h1></body></html>\n${bt}\nI added Caveat font and micro-interactions!`;
    const cleaned = sanitizeHtmlResponse(raw);
    assert.strictEqual(cleaned.includes('Here is the requested'), false);
    assert.strictEqual(cleaned.includes('I added Caveat font'), false);
    assert.match(cleaned, /<!DOCTYPE html>/);
    assert.match(cleaned, /Lily's Scrapbook/);
  });

  await test('Sanitizer automatically injects parent iframe auto-resize protocol', () => {
    const raw = "<!DOCTYPE html><html><head></head><body><h1>Test</h1></body></html>";
    const cleaned = sanitizeHtmlResponse(raw);
    assert.match(cleaned, /doodle-resize/);
    assert.match(cleaned, /window\.parent\.postMessage/);
  });

  await test('generateCanvasFromDoodle sends request with x-goog-api-key and sanitizes response', async () => {
    const origFetch = global.fetch;
    let capturedHeaders = null;
    let capturedBody = null;
    global.fetch = async (url, options) => {
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: '```html\n<!DOCTYPE html><html><head></head><body><h1>Hello</h1></body></html>\n```' }]
          },
          finishReason: 'STOP'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const res = await generateCanvasFromDoodle({
        snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        notes: 'Coffee time',
        imageUrls: ['https://example.com/pic.jpg'],
      }, testEnv);

      assert.strictEqual(capturedHeaders['x-goog-api-key'], 'test-gemini-key');
      assert.strictEqual(res.html.includes('```'), false);
      assert.match(res.html, /doodle-resize/);
      assert.match(res.html, /Hello/);
      assert.strictEqual(res.model, 'gemini-3.8-flash');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasFromDoodle rejects truncated generation when finishReason is MAX_TOKENS', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: '<!DOCTYPE html><html><body>Incomplete' }] },
          finishReason: 'MAX_TOKENS'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasFromDoodle({
          snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }, testEnv);
      }, /max token limit/i);
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasFromDoodle throws clean busy server error on 503, 429, or RESOURCE_EXHAUSTED without fallback models', async () => {
    const origFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({
        error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasFromDoodle({
          snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }, testEnv);
      }, (err) => {
        assert.strictEqual(err.message, 'Server is currently busy. Please try again in a few moments.');
        return true;
      });
      // Verify no fallback models were attempted (exactly 1 call)
      assert.strictEqual(callCount, 1, 'Must not attempt fallback models');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('POST /api/generate returns HTTP 503 with clean busy message when Gemini is overloaded', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      return new Response(JSON.stringify({
        error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' }
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
      const req = new Request('https://worker.test/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
        },
        body: JSON.stringify({
          snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }),
      });
      const res = await workerDefault.fetch(req, devEnv);
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.error, 'Server is currently busy. Please try again in a few moments.');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasAssistPlan throws clean busy server error on 503 or 429 without fallback models', async () => {
    const origFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({
        error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasAssistPlan({
          prompt: 'ragebait website for stinky gf',
          width: 390,
          height: 600,
        }, testEnv);
      }, (err) => {
        assert.strictEqual(err.message, 'Server is currently busy. Please try again in a few moments.');
        return true;
      });
      assert.strictEqual(callCount, 1, 'Must not attempt fallback models');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('POST /api/assist returns HTTP 503 with clean busy message when Gemini is overloaded', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      return new Response(JSON.stringify({
        error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
      const req = new Request('https://worker.test/api/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
        },
        body: JSON.stringify({
          prompt: 'ragebait website for stinky gf',
          width: 390,
          height: 600,
        }),
      });
      const res = await workerDefault.fetch(req, devEnv);
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.error, 'Server is currently busy. Please try again in a few moments.');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasFromDoodle filters out thought parts and sends correct generationConfig', async () => {
    const origFetch = global.fetch;
    let capturedBody = null;
    global.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { thought: true, text: 'Thinking about the bee layout...' },
              { text: '<!DOCTYPE html><html><head></head><body><h1>Yellow Bee</h1></body></html>' }
            ]
          },
          finishReason: 'STOP'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const res = await generateCanvasFromDoodle({
        snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        notes: 'Yellow bee site',
      }, testEnv);

      assert.strictEqual(capturedBody.generationConfig.maxOutputTokens, 16384);
      assert.strictEqual(capturedBody.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
      assert.strictEqual(capturedBody.generationConfig.temperature, undefined);
      assert.strictEqual(capturedBody.generationConfig.topP, undefined);
      assert.match(res.html, /Yellow Bee/);
      assert.strictEqual(res.html.includes('Thinking about the bee layout'), false);
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasFromDoodle catches subrequest timeout and throws clean busy server error', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      const abortErr = new Error('The operation was aborted due to timeout');
      abortErr.name = 'TimeoutError';
      throw abortErr;
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasFromDoodle({
          snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }, testEnv);
      }, (err) => {
        assert.strictEqual(err.message, 'Server is currently busy. Please try again in a few moments.');
        return true;
      });
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasAssistPlan filters out thought parts and sends correct generationConfig', async () => {
    const origFetch = global.fetch;
    let capturedBody = null;
    global.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { thought: true, text: 'Brainstorming funny teasing lines for gf...' },
              { text: JSON.stringify({
                strokes: [],
                notes: [{ text: '🚨 OFFICIAL STINKY ALERT 🚨', x: 50, y: 50 }],
                stickers: [{ assetId: 'sticker-sparkles', x: 100, y: 100 }]
              }) }
            ]
          },
          finishReason: 'STOP'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const plan = await generateCanvasAssistPlan({
        prompt: 'ragebait website for stinky gf',
        width: 390,
        height: 600,
      }, testEnv);

      assert.strictEqual(capturedBody.generationConfig.maxOutputTokens, 8192);
      assert.strictEqual(capturedBody.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
      assert.strictEqual(capturedBody.generationConfig.temperature, undefined);
      assert.strictEqual(plan.notes[0].text, '🚨 OFFICIAL STINKY ALERT 🚨');
      assert.strictEqual(plan.stickers[0].assetId, 'sticker-sparkles');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasAssistPlan catches subrequest timeout and throws clean busy server error', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      const abortErr = new Error('The operation was aborted due to timeout');
      abortErr.name = 'TimeoutError';
      throw abortErr;
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasAssistPlan({
          prompt: 'ragebait website for stinky gf',
          width: 390,
          height: 600,
        }, testEnv);
      }, (err) => {
        assert.strictEqual(err.message, 'Server is currently busy. Please try again in a few moments.');
        return true;
      });
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasFromDoodle catches response body stream timeout and throws clean busy server error', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        text: async () => {
          const timeoutErr = new Error('The operation was aborted due to timeout');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        },
      };
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasFromDoodle({
          snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }, testEnv);
      }, (err) => {
        assert.strictEqual(err.message, 'Server is currently busy. Please try again in a few moments.');
        return true;
      });
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasAssistPlan catches response body stream timeout and throws clean busy server error', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        text: async () => {
          const timeoutErr = new Error('The operation was aborted due to timeout');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        },
      };
    };

    try {
      await assert.rejects(async () => {
        await generateCanvasAssistPlan({
          prompt: 'test prompt',
          width: 390,
          height: 600,
        }, testEnv);
      }, (err) => {
        assert.strictEqual(err.message, 'Server is currently busy. Please try again in a few moments.');
        return true;
      });
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('generateCanvasAssistPlan parses JSON wrapped in markdown fences with conversational preamble and postscript', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { thought: true, text: 'Thinking about the layout design...' },
              { text: 'Here is the adorable layout you asked for!\n```json\n{\n  "strokes": [],\n  "notes": [{"text": "Hello Bee World", "x": 50, "y": 80}],\n  "stickers": [{"assetId": "sticker-star", "x": 90, "y": 110}]\n}\n```\nHope you love it!' }
            ]
          },
          finishReason: 'STOP'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const plan = await generateCanvasAssistPlan({
        prompt: 'bee world',
        width: 390,
        height: 600,
      }, testEnv);

      assert.strictEqual(plan.notes[0].text, 'Hello Bee World');
      assert.strictEqual(plan.stickers[0].assetId, 'sticker-star');
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('POST /api/assist rejects prompts exceeding 2000 characters with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const longPrompt = 'a'.repeat(2001);
    const req = new Request('https://worker.test/api/assist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        prompt: longPrompt,
        width: 390,
        height: 600,
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /exceeds maximum length/);
  });

  // ==========================================
  // SECTION 3: GITHUB COMMIT HANDLER TESTS (Real Implementation)
  // ==========================================
  console.log('\n--- 3. GitHub Contents API Handler Tests ---');

  await test('Real utf8ToBase64 encoder handles emojis and multilingual unicode correctly', () => {
    const input = '<h1>Lily\'s Corner 🌸🥐✨</h1>\n<p>Doodled with love ♡ à bientôt €100</p>';
    const encoded = utf8ToBase64(input);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    assert.strictEqual(decoded, input, 'Decoded Base64 must match original unicode string');
  });

  await test('getGitHubConfig parses individual env variables', () => {
    const config = getGitHubConfig({
      GITHUB_OWNER: 'girlfriend-art',
      GITHUB_REPO: 'live-portfolio',
      GITHUB_BRANCH: 'main',
      GITHUB_CANVAS_PATH: 'canvas.html',
    });
    assert.strictEqual(config.owner, 'girlfriend-art');
    assert.strictEqual(config.repo, 'live-portfolio');
    assert.strictEqual(config.branch, 'main');
    assert.strictEqual(config.canvasPath, 'canvas.html');
  });

  await test('getGitHubConfig parses JSON string GITHUB_REPO_CONFIG', () => {
    const config = getGitHubConfig({
      GITHUB_REPO_CONFIG: JSON.stringify({
        owner: 'custom-owner',
        repo: 'custom-site',
        branch: 'gh-pages',
        canvasPath: 'public/canvas.html',
      }),
    });
    assert.strictEqual(config.owner, 'custom-owner');
    assert.strictEqual(config.repo, 'custom-site');
    assert.strictEqual(config.branch, 'gh-pages');
    assert.strictEqual(config.canvasPath, 'public/canvas.html');
  });

  await test('commitCanvasToGitHub resolves existing SHA and attributes committer correctly', async () => {
    const origFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'GET') {
        return new Response(JSON.stringify({ sha: 'mock-target-sha-44556' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.sha, 'mock-target-sha-44556', 'Must send retrieved SHA');
        assert.strictEqual(body.committer.name, 'Kieran Patton');
        assert.strictEqual(body.committer.email, 'testowner@users.noreply.github.com');
        assert.strictEqual(body.author.name, 'Kieran Patton');
        assert.strictEqual(body.author.email, 'testowner@users.noreply.github.com');
        assert.match(body.message, /Doodlebug/);
        return new Response(JSON.stringify({
          commit: { sha: 'mock-commit-sha-77889' },
          content: { html_url: 'https://github.com/testowner/testrepo/blob/main/canvas.html' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    };

    try {
      const res = await commitCanvasToGitHub({
        html: '<!DOCTYPE html><html><body><h1>Test SHA Resolution</h1></body></html>',
      }, testEnv);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.commitSha, 'mock-commit-sha-77889');
      assert.strictEqual(calls.length, 2);
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('commitCanvasToGitHub retries on 409 conflict with re-fetched blob SHA', async () => {
    const origFetch = global.fetch;
    let getCount = 0;
    let putCount = 0;
    global.fetch = async (url, options) => {
      if (options.method === 'GET') {
        getCount++;
        return new Response(JSON.stringify({ sha: `mock-sha-v${getCount}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (options.method === 'PUT') {
        putCount++;
        if (putCount === 1) {
          // Simulate race condition / concurrent edit on first attempt
          return new Response(JSON.stringify({ message: 'Resource was modified' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const body = JSON.parse(options.body);
        assert.strictEqual(body.sha, 'mock-sha-v2', 'Retry must use newly updated SHA from re-fetch');
        return new Response(JSON.stringify({
          commit: { sha: 'mock-commit-resolved-sha' },
          content: { html_url: 'https://github.com/testowner/testrepo/blob/main/canvas.html' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    };

    try {
      const res = await commitCanvasToGitHub({
        html: '<!DOCTYPE html><html><body><h1>Retry Test</h1></body></html>',
      }, testEnv);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.commitSha, 'mock-commit-resolved-sha');
      assert.strictEqual(putCount, 2);
      assert.strictEqual(getCount, 2);
    } finally {
      global.fetch = origFetch;
    }
  });

  // ==========================================
  // SECTION 4: ROUTER & API CONTRACT TESTS (Real Worker fetch handler)
  // ==========================================
  console.log('\n--- 4. Cloudflare Worker Router & CORS Contract Tests ---');

  await test('CORS headers allow GET, POST, OPTIONS and required headers', () => {
    const cors = getCorsHeaders({ CORS_ORIGIN: '*' });
    assert.strictEqual(cors['Access-Control-Allow-Origin'], '*');
    assert.match(cors['Access-Control-Allow-Methods'], /POST/);
    assert.match(cors['Access-Control-Allow-Methods'], /OPTIONS/);
    assert.match(cors['Access-Control-Allow-Headers'], /Authorization/);
    assert.match(cors['Access-Control-Allow-Headers'], /Content-Type/);
  });

  await test('OPTIONS preflight request returns 204 with CORS headers', async () => {
    const req = new Request('https://worker.test/api/generate', { method: 'OPTIONS' });
    const res = await workerDefault.fetch(req, testEnv);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
  });

  await test('GET /health returns 200 with service configuration without leaking secrets', async () => {
    const req = new Request('https://worker.test/health', { method: 'GET' });
    const res = await workerDefault.fetch(req, testEnv);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.service, 'doodlebug-gateway');
    assert.strictEqual(data.hasGeminiKey, undefined);
    assert.strictEqual(data.hasGitHubPat, undefined);
    assert.strictEqual(data.target, undefined);
  });

  await test('POST /api/generate without auth returns 401', async () => {
    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotBase64: 'abc' }),
    });
    const res = await workerDefault.fetch(req, testEnv);
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/generate with dev bypass but missing snapshotBase64 returns 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({ notes: 'test without snapshot' }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /snapshotBase64/i);
  });

  await test('POST /api/generate rejects invalid imageUrl format with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageUrls: ['ftp://malicious-scheme.com/bad.exe'],
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /imageUrl/i);
  });

  await test('POST /api/publish with missing html returns 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({ commitMessage: 'test' }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /html/i);
  });

  await test('POST /api/publish rejects malformed non-document HTML with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({ html: 'just a random non-html string' }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /complete HTML document/i);
  });

  await test('POST /api/generate rejects untrusted image host with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageUrls: ['https://malicious-tracker.com/pixel.png'],
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /imageUrl/i);
  });

  await test('POST /api/generate rejects insecure http:// image URL with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageUrls: ['http://islacowper.co.uk/img/photo_123_abc123.png'],
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /imageUrl/i);
  });

  await test('POST /api/publish rejects HTML missing closing </html> with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({ html: '<!DOCTYPE html><html><head></head><body><h1>Unclosed' }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /complete HTML document/i);
  });

  await test('POST /api/publish rejects unauthorized external scripts with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        html: '<!DOCTYPE html><html><head><script src="https://attacker.com/evil.js"></script></head><body>Hello</body></html>',
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /unauthorized external script/i);
  });

  await test('POST /api/generate returns 429 Too Many Requests when rate limit exceeded', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true', ALLOWED_FIREBASE_UID: 'rate-limit-test-user' };
    resetRateLimits();

    // Consume the limit (10 allowed per minute)
    for (let i = 0; i < 10; i++) {
      const allowed = checkRateLimit('generate:rate-limit-test-user', 10, 60_000);
      assert.strictEqual(allowed.allowed, true);
    }

    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-rate-limit-test-user',
      },
      body: JSON.stringify({
        snapshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.headers.get('Retry-After') !== null, true);
    const data = await res.json();
    assert.match(data.error, /too many/i);

    // Reset rate limits for remaining tests
    resetRateLimits();
  });

  await test('POST /api/publish rejects unclosed script tags with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        html: '<!DOCTYPE html><html><head><script src="https://evil.com/unclosed.js"></head><body>Hello</body></html>',
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /mismatched or unclosed <script>/i);
  });

  await test('POST /api/publish rejects unquoted unauthorized external scripts with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        html: '<!DOCTYPE html><html><head><script src=https://attacker.com/evil.js></script></head><body>Hello</body></html>',
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /unauthorized external script/i);
  });

  await test('POST /api/publish rejects meta refresh redirects with 400', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };
    const req = new Request('https://worker.test/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        html: '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=https://evil.com"></head><body>Hello</body></html>',
      }),
    });
    const res = await workerDefault.fetch(req, devEnv);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /meta refresh/i);
  });

  await test('isValidImageUrl restricts to GitHub img/ folder on live domain & repo, and rejects Firebase Storage / foreign repos / SVGs / traversal / query / credentials', () => {
    const prodEnv = { ...testEnv, DEV_BYPASS_AUTH: 'false', ENVIRONMENT: 'production' };
    const validLiveImgUrl = 'https://islacowper.co.uk/img/photo_1730000_abc123.jpg';
    const validGhPagesImgUrl = 'https://testowner.github.io/testrepo/img/photo_1730000_abc123.png';
    const validRawGhImgUrl = 'https://raw.githubusercontent.com/testowner/testrepo/main/img/photo_1730000_abc123.webp';
    const foreignRepoUrl = 'https://raw.githubusercontent.com/foreign-hacker/evilrepo/main/img/photo_1730000_abc123.jpg';
    const nonImgPathUrl = 'https://islacowper.co.uk/other/photo.png';
    const svgImgUrl = 'https://islacowper.co.uk/img/vector.svg';
    const legacyFirebaseStorageUrl = 'https://firebasestorage.googleapis.com/v0/b/doodlebug-pwa-demo.appspot.com/o/pic.png?alt=media';
    const encodedTraversalUrl = 'https://islacowper.co.uk/img/..%2Fcanvas.html';
    const cdnEncodedTraversalUrl = 'https://images.unsplash.com/photo-123/%2e%2e%2fadmin';
    const queryOnImgUrl = 'https://islacowper.co.uk/img/photo_1730000_abc123.jpg?inject=1';
    const hashOnImgUrl = 'https://islacowper.co.uk/img/photo_1730000_abc123.jpg#fragment';
    const credentialsImgUrl = 'https://user:pass@islacowper.co.uk/img/photo_1730000_abc123.jpg';
    const customPortImgUrl = 'https://islacowper.co.uk:8443/img/photo_1730000_abc123.jpg';
    const rootGhPagesWrongRepoUrl = 'https://testowner.github.io/img/photo_1730000_abc123.png';

    assert.strictEqual(isValidImageUrl(validLiveImgUrl, prodEnv), true);
    assert.strictEqual(isValidImageUrl(validGhPagesImgUrl, prodEnv), true);
    assert.strictEqual(isValidImageUrl(validRawGhImgUrl, prodEnv), true);
    assert.strictEqual(isValidImageUrl(foreignRepoUrl, prodEnv), false, 'Must reject foreign GitHub repository');
    assert.strictEqual(isValidImageUrl(nonImgPathUrl, prodEnv), false, 'Must reject paths outside /img/');
    assert.strictEqual(isValidImageUrl(svgImgUrl, prodEnv), false, 'Must reject SVG files in /img/');
    assert.strictEqual(isValidImageUrl(legacyFirebaseStorageUrl, prodEnv), false, 'Must reject legacy Firebase Storage URLs');
    assert.strictEqual(isValidImageUrl(encodedTraversalUrl, prodEnv), false, 'Must reject URL-encoded path traversal on img/');
    assert.strictEqual(isValidImageUrl(cdnEncodedTraversalUrl, prodEnv), false, 'Must reject URL-encoded path traversal on CDN');
    assert.strictEqual(isValidImageUrl(queryOnImgUrl, prodEnv), false, 'Must reject query strings on img/ URLs');
    assert.strictEqual(isValidImageUrl(hashOnImgUrl, prodEnv), false, 'Must reject hash fragments on img/ URLs');
    assert.strictEqual(isValidImageUrl(credentialsImgUrl, prodEnv), false, 'Must reject embedded credentials in URL');
    assert.strictEqual(isValidImageUrl(customPortImgUrl, prodEnv), false, 'Must reject non-standard port in URL');
    assert.strictEqual(isValidImageUrl(rootGhPagesWrongRepoUrl, prodEnv), false, 'Must reject root github.io path when repo is a project subpath');

    const subpathEnv = { ...prodEnv, PUBLIC_SITE_URL: 'https://custom.domain.co.uk/subsite' };
    assert.strictEqual(isValidImageUrl('https://custom.domain.co.uk/subsite/img/photo_1.jpg', subpathEnv), true);
    assert.strictEqual(isValidImageUrl('https://custom.domain.co.uk/img/photo_1.jpg', subpathEnv), false, 'Must enforce PUBLIC_SITE_URL basePath prefix');
  });

  await test('POST /api/upload and uploadImageToGitHub commit validated raster photo to GitHub img/, reject disguised SVGs and >5MB payloads', async () => {
    const devEnv = { ...testEnv, DEV_BYPASS_AUTH: 'true' };

    // 1. Disguised SVG payload must be rejected with 400
    const svgB64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const badReq = new Request('https://worker.test/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
      },
      body: JSON.stringify({
        dataBase64: `data:image/jpeg;base64,${svgB64}`,
        fileName: 'photo_1730000_abc123.jpg',
      }),
    });
    const badRes = await workerDefault.fetch(badReq, devEnv);
    assert.strictEqual(badRes.status, 400);
    const badData = await badRes.json();
    assert.match(badData.error, /Vector images \(SVG\) are not allowed/i);

    // 1b. Payload > 5MB must be rejected before full regex/upload
    const oversizedB64 = 'A'.repeat(7_000_000); // ~5.25MB decoded
    const oversizedCheck = sniffRasterMimeTypeFromBase64(oversizedB64);
    assert.strictEqual(oversizedCheck.valid, false);
    assert.match(oversizedCheck.error, /5MB upload limit/);

    // 2. Valid PNG payload commits to img/ on GitHub and returns https://islacowper.co.uk/img/...
    const origFetch = global.fetch;
    let putUrlCalled = '';
    global.fetch = async (url, options) => {
      putUrlCalled = String(url);
      return new Response(
        JSON.stringify({ commit: { sha: 'img-upload-commit-sha-123' } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    };

    try {
      const validPngB64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const okReq = new Request('https://worker.test/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token-uid-gf-authorized-uid-12345',
        },
        body: JSON.stringify({
          dataBase64: validPngB64,
          fileName: 'photo_1730000123_abc123.png',
        }),
      });
      const okRes = await workerDefault.fetch(okReq, devEnv);
      assert.strictEqual(okRes.status, 200);
      const okData = await okRes.json();
      assert.strictEqual(okData.success, true);
      assert.strictEqual(okData.path, 'img/photo_1730000123_abc123.png');
      assert.strictEqual(okData.url, 'https://islacowper.co.uk/img/photo_1730000123_abc123.png');
      assert.match(putUrlCalled, /\/contents\/img\/photo_1730000123_abc123\.png$/);
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('cleanupUnusedGitHubImages deletes unreferenced photo_* uploads from img/ while preserving referenced photos, static non-photo_* assets, and .gitkeep', async () => {
    const origFetch = global.fetch;
    const deletedUrls = [];
    global.fetch = async (url, options) => {
      if (options.method === 'GET') {
        return new Response(
          JSON.stringify([
            { name: '.gitkeep', type: 'file', sha: 'sha-keep' },
            { name: 'logo.png', type: 'file', sha: 'sha-static-logo' },
            { name: 'photo_active_111111.jpg', type: 'file', sha: 'sha-active' },
            { name: 'photo_css_333333.webp', type: 'file', sha: 'sha-css' },
            { name: 'photo_old_222222.jpg', type: 'file', sha: 'sha-old' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (options.method === 'DELETE') {
        deletedUrls.push(String(url));
        return new Response(JSON.stringify({ commit: { sha: 'del-sha' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    };

    try {
      const html = '<!DOCTYPE html><html><body style="background-image: url(\'https://islacowper.co.uk/img/photo_css_333333.webp\')"><img src="https://islacowper.co.uk/img/photo_active_111111.jpg"></body></html>';
      const res = await cleanupUnusedGitHubImages(html, testEnv);
      assert.deepStrictEqual(res.deleted, ['photo_old_222222.jpg']);
      assert.strictEqual(deletedUrls.length, 1);
      assert.match(deletedUrls[0], /photo_old_222222\.jpg$/);
    } finally {
      global.fetch = origFetch;
    }
  });

  await test('Sanitizer preserves valid JavaScript inside <script> while stripping inline HTML event attributes', () => {
    const raw = `<!DOCTYPE html>
<html>
<head><script src="https://cdn.tailwindcss.com"></script></head>
<body>
  <img src="pic.jpg" onerror="alert(1)">
  <button onclick="doAction()">Click</button>
  <script>
    window.onload = function() { console.log("ready"); };
    img.onerror = function() { console.log("load error"); };
  </script>
</body>
</html>`;
    const cleaned = sanitizeHtmlResponse(raw);
    assert.strictEqual(cleaned.includes('onerror="alert(1)"'), false, 'Must strip inline onerror on <img>');
    assert.strictEqual(cleaned.includes('onclick="doAction()"'), false, 'Must strip inline onclick on <button>');
    assert.strictEqual(cleaned.includes('window.onload = function()'), true, 'Must preserve window.onload inside <script>');
    assert.strictEqual(cleaned.includes('img.onerror = function()'), true, 'Must preserve img.onerror inside <script>');
  });

  await test('validateCanvasHtml allows valid script property assignments but rejects HTML event attributes, <base>, and <form>', () => {
    const validHtml = `<!DOCTYPE html>
<html>
<head><script src="https://cdn.tailwindcss.com"></script></head>
<body>
  <div id="app">Hello</div>
  <script>
    window.onload = function() { let likes = 0; console.log(likes); };
  </script>
</body>
</html>`;
    const resValid = validateCanvasHtml(validHtml);
    assert.strictEqual(resValid.valid, true, 'Valid script assignment must pass validation');

    const htmlWithImgOnerror = validHtml.replace('Hello', '<img src="x" onerror="alert(1)">');
    assert.strictEqual(validateCanvasHtml(htmlWithImgOnerror).valid, false, 'Inline HTML onerror must be rejected');

    const htmlWithOnclick = validHtml.replace('Hello', '<button onclick="alert(1)">Click</button>');
    assert.strictEqual(validateCanvasHtml(htmlWithOnclick).valid, false, 'Inline HTML onclick must be rejected');

    const htmlWithOnmouseover = validHtml.replace('Hello', '<div onmouseover="alert(1)">Hover</div>');
    assert.strictEqual(validateCanvasHtml(htmlWithOnmouseover).valid, false, 'Inline HTML onmouseover must be rejected');

    const htmlWithForm = validHtml.replace('Hello', '<form action="/hack"><input /></form>');
    assert.strictEqual(validateCanvasHtml(htmlWithForm).valid, false, '<form> elements must be rejected');

    const htmlWithBase = validHtml.replace('Hello', '<base href="https://evil.com">');
    assert.strictEqual(validateCanvasHtml(htmlWithBase).valid, false, '<base> elements must be rejected');

    const htmlWithIframe = validHtml.replace('Hello', '<iframe src="https://evil.com"></iframe>');
    assert.strictEqual(validateCanvasHtml(htmlWithIframe).valid, false, '<iframe> elements must be rejected');

    const htmlWithObject = validHtml.replace('Hello', '<object data="https://evil.com"></object>');
    assert.strictEqual(validateCanvasHtml(htmlWithObject).valid, false, '<object> elements must be rejected');

    const htmlWithJsHref = validHtml.replace('Hello', '<a href="javascript:alert(1)">click</a>');
    assert.strictEqual(validateCanvasHtml(htmlWithJsHref).valid, false, 'javascript: links must be rejected');

    const htmlWithJsSpaces = validHtml.replace('Hello', '<a href="  javascript : alert(1) ">click</a>');
    assert.strictEqual(validateCanvasHtml(htmlWithJsSpaces).valid, false, 'javascript : with spaces must be rejected');

    const htmlWithVbscript = validHtml.replace('Hello', '<a href="vbscript:msgbox(1)">click</a>');
    assert.strictEqual(validateCanvasHtml(htmlWithVbscript).valid, false, 'vbscript: links must be rejected');

    const htmlWithFunctionCtor = validHtml.replace('let likes = 0;', 'const f = new Function("return 1");');
    assert.strictEqual(validateCanvasHtml(htmlWithFunctionCtor).valid, false, 'new Function constructor must be rejected');

    const repoCanvasHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'canvas.html'), 'utf8');
    const canvasRes = validateCanvasHtml(repoCanvasHtml);
    assert.strictEqual(canvasRes.valid, true, `Repository canvas.html must satisfy validator: ${canvasRes.error}`);
  });

  await test('getCorsHeaders properly handles multi-origin list, single-origin return, and Vary: Origin header', () => {
    const multiEnv = { CORS_ORIGIN: 'http://localhost:3000, https://doodlebug.site' };

    // Matched origin
    const corsMatched = getCorsHeaders(multiEnv, 'https://doodlebug.site');
    assert.strictEqual(corsMatched['Access-Control-Allow-Origin'], 'https://doodlebug.site');
    assert.strictEqual(corsMatched['Vary'], 'Origin');

    // Localhost dev origin (even if configured origin didn't explicitly match the port)
    const corsLocalhost = getCorsHeaders({ CORS_ORIGIN: 'https://doodlebug.site' }, 'http://localhost:5173');
    assert.strictEqual(corsLocalhost['Access-Control-Allow-Origin'], 'http://localhost:5173');

    // LAN Wi-Fi dev origin for mobile testing
    const corsLan = getCorsHeaders({ CORS_ORIGIN: 'https://doodlebug.site' }, 'http://192.168.28.92:3000');
    assert.strictEqual(corsLan['Access-Control-Allow-Origin'], 'http://192.168.28.92:3000');

    // Unmatched foreign origin: returns primary origin instead of invalid comma-separated string
    const corsUnmatched = getCorsHeaders(multiEnv, 'https://attacker.com');
    assert.strictEqual(corsUnmatched['Access-Control-Allow-Origin'], 'http://localhost:3000');
    assert.strictEqual(corsUnmatched['Vary'], 'Origin');
  });

  await test('Pre-auth IP rate limiter blocks excessive requests before auth check', async () => {
    resetRateLimits();
    const spamIp = '198.51.100.42';

    // Send 60 requests to fill bucket
    for (let i = 0; i < 60; i++) {
      checkRateLimit(`ip:${spamIp}`, 60, 60_000);
    }

    // 61st request should be rejected with 429
    const req = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': spamIp,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const res = await workerDefault.fetch(req, testEnv);
    assert.strictEqual(res.status, 429);
    const data = await res.json();
    assert.match(data.error, /too many requests from your ip/i);

    resetRateLimits();
  });

  await test('Pre-auth rate limiter isolates buckets when client IP headers are absent', async () => {
    resetRateLimits();
    const token1 = 'Bearer client-token-aaa-11111111111111111111111111111111';
    const token2 = 'Bearer client-token-bbb-22222222222222222222222222222222';

    const req1 = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token1,
      },
      body: JSON.stringify({}),
    });
    const req2 = new Request('https://worker.test/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token2,
      },
      body: JSON.stringify({}),
    });

    const key1 = `auth:${token1.slice(-32)}`;
    for (let i = 0; i < 60; i++) {
      checkRateLimit(key1, 60, 60_000);
    }

    const res1 = await workerDefault.fetch(req1, testEnv);
    assert.strictEqual(res1.status, 429, 'Client 1 exceeding pre-auth limit must get 429');

    const res2 = await workerDefault.fetch(req2, testEnv);
    assert.strictEqual(res2.status, 401, 'Client 2 must not be throttled by client 1 bucket (reaches token validation 401)');

    resetRateLimits();
  });

  await test('Sanitizer strips <base>, <form>, <iframe>, and neutralizes pseudo-protocol URIs while preserving scripts', () => {
    const raw = `<!DOCTYPE html>
<html>
<head><base href="https://evil.com"><script src="https://cdn.tailwindcss.com"></script></head>
<body>
  <iframe src="https://phishing.com"></iframe>
  <form action="/steal"><input name="pw"></form>
  <a href="javascript:alert(1)">click</a>
  <script>
    window.onload = function() { console.log("preserved"); };
  </script>
</body>
</html>`;
    const cleaned = sanitizeHtmlResponse(raw);
    assert.strictEqual(cleaned.includes('<base'), false, 'Must strip <base>');
    assert.strictEqual(cleaned.includes('<iframe'), false, 'Must strip <iframe>');
    assert.strictEqual(cleaned.includes('<form'), false, 'Must strip <form>');
    assert.strictEqual(cleaned.includes('javascript:alert'), false, 'Must neutralize javascript: URI');
    assert.strictEqual(cleaned.includes('window.onload = function()'), true, 'Must preserve script content');
    const valid = validateCanvasHtml(cleaned);
    assert.strictEqual(valid.valid, true, 'Sanitized output must be valid');
  });

  await test('checkRateLimit prunes expired buckets when store grows large', () => {
    resetRateLimits();
    // Insert 501 expired buckets
    const pastTime = Date.now() - 10_000;
    for (let i = 0; i < 505; i++) {
      checkRateLimit(`old-key-${i}`, 10, -5000);
    }
    // Now call checkRateLimit for a new key; it should prune the expired buckets
    const res = checkRateLimit('fresh-key', 10, 60_000);
    assert.strictEqual(res.allowed, true);
    resetRateLimits();
  });

  await test('Unknown route returns 404', async () => {
    const req = new Request('https://worker.test/unknown-endpoint', { method: 'GET' });
    const res = await workerDefault.fetch(req, testEnv);
    assert.strictEqual(res.status, 404);
  });

  await test('isValidImageUrl allows Tenor and Giphy HTTPS GIF URLs while rejecting HTTP and untrusted domains', () => {
    const prodEnv = { ...testEnv, DEV_BYPASS_AUTH: 'false', FIREBASE_PROJECT_ID: 'doodlebug-pwa-demo', ENVIRONMENT: 'production' };
    assert.strictEqual(isValidImageUrl('https://media1.tenor.com/m/aKFaZBrZFYcAAAAC/peach-cat-heart.gif', prodEnv), true);
    assert.strictEqual(isValidImageUrl('https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', prodEnv), true);
    assert.strictEqual(isValidImageUrl('http://media1.tenor.com/m/aKFaZBrZFYcAAAAC/peach-cat-heart.gif', prodEnv), false);
    assert.strictEqual(isValidImageUrl('https://evil-tenor.com/bad.gif', prodEnv), false);
  });

  await test('buildGeminiPrompt includes instructions for GIFs, aesthetic stickers, and washi tape', () => {
    const prompt = buildGeminiPrompt('[Decorative sticker: Kawaii Kitty Sticker]', ['https://media1.tenor.com/m/cat.gif']);
    assert.match(prompt, /washi tape/i);
    assert.match(prompt, /Kawaii Kitty Sticker/);
    assert.match(prompt, /https:\/\/media1\.tenor\.com\/m\/cat\.gif/);
    assert.strictEqual(prompt.includes('Current Obsession'), false, 'Music widget rules must be removed');
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
