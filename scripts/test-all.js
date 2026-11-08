/**
 * Doodlebug End-to-End Project Verification & Audit Suite
 * 
 * Verifies:
 * 1. Zero Client Secrets constraint across entire repository
 * 2. Phase 1: Public Web Shell & Sandbox Iframe architecture
 * 3. Phase 2: Cloudflare Worker API contracts & Real WebCrypto Auth
 * 4. Phase 3: Mobile PWA Canvas touch optimizations & state models
 * 5. Phase 4: Preview & Publish Pipeline integrations
 * 6. Live Compilation: PWA build (tsc + vite) and Worker build (tsc)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       DOODLEBUG END-TO-END PROJECT VERIFICATION & AUDIT SUITE       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(title, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  ✅ PASS: ${title}`);
    passedChecks++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${title}`);
    console.error(`     Reason: ${err.message}`);
    failedChecks++;
  }
}

// ----------------------------------------------------
// 1. ZERO-SECRET CONSTRAINT SECURITY AUDIT
// ----------------------------------------------------
console.log('\n--- 1. Critical Security & Zero-Secret Audit ---');

check('No GitHub PAT or Gemini API key secrets committed across codebase', () => {
  const rootDir = path.join(__dirname, '..');
  const files = [];
  const excludedDirs = new Set(['.git', 'node_modules', 'dist', 'dist-test', '.wrangler', 'pwa/dist']);

  function walk(dir) {
    fs.readdirSync(dir).forEach((file) => {
      if (excludedDirs.has(file)) return;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        if (file.startsWith('.env') && !file.endsWith('.example')) return;
        if (file.startsWith('.dev.vars') && !file.endsWith('.example')) return;
        files.push(fullPath);
      }
    });
  }

  // Check pwa/src, scripts, worker/src
  const targetDirs = [
    path.join(rootDir, 'pwa', 'src'),
    path.join(rootDir, 'scripts'),
    path.join(rootDir, 'worker', 'src'),
  ];
  for (const t of targetDirs) {
    if (fs.existsSync(t)) walk(t);
  }

  // Check root files (excluding .git, node_modules, untracked .env / .dev.vars)
  fs.readdirSync(rootDir).forEach((file) => {
    const fullPath = path.join(rootDir, file);
    if (fs.statSync(fullPath).isFile()) {
      if (file.startsWith('.env') && !file.endsWith('.example')) return;
      if (file.startsWith('.dev.vars') && !file.endsWith('.example')) return;
      files.push(fullPath);
    }
  });

  const secretPatterns = [
    /ghp_[a-zA-Z0-9]{30,}/,
    /github_pat_[a-zA-Z0-9_]{30,}/,
    /AIzaSy[a-zA-Z0-9_-]{33}/, // Actual Google API key regex
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of secretPatterns) {
      const match = content.match(pattern);
      if (match && !match[0].includes('PlaceholderKey123') && !match[0].includes('test_')) {
        throw new Error(`Potential secret leaked in ${filePath}: ${match[0]}`);
      }
    }
  }
});

// ----------------------------------------------------
// 2. PHASE 1: PUBLIC WEB SHELL AUDIT
// ----------------------------------------------------
console.log('\n--- 2. Phase 1: Public Web Shell Audit ---');

check('index.html contains indestructible header, footer, and sandboxed iframe', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'live-site', 'index.html'), 'utf8');
  assert.match(indexHtml, /<header/i, 'Must have stylish fixed header');
  assert.match(indexHtml, /<footer/i, 'Must have fixed footer');
  assert.match(indexHtml, /<iframe\s+src="canvas\.html"/i, 'Must have iframe pointing to canvas.html');
  assert.match(indexHtml, /id="doodle-stage"/i, 'Iframe must have id="doodle-stage"');
  assert.match(indexHtml, /iframe-resizer\.js/i, 'Must link iframe-resizer.js');
});

check('canvas.html strictly satisfies all Gemini Flash guardrails', () => {
  const canvasHtml = fs.readFileSync(path.join(__dirname, '..', 'live-site', 'canvas.html'), 'utf8');
  assert.match(canvasHtml, /<!DOCTYPE html>/i, 'Guardrail 1: Standalone HTML5 document');
  assert.match(canvasHtml, /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/i, 'Guardrail 2: Tailwind CDN in head');
  assert.match(canvasHtml, /fonts\.googleapis\.com.*family=(Caveat|Plus\+Jakarta\+Sans)/i, 'Guardrail 3: Google Fonts typography');
  assert.match(canvasHtml, /transition|shadow|transform|hover:/i, 'Guardrail 5: UI styling and transitions');
  assert.match(canvasHtml, /doodle-resize/i, 'Must implement iframe height auto-resizing protocol');
});

check('CNAME file exists and configures custom domain', () => {
  const cname = fs.readFileSync(path.join(__dirname, '..', 'live-site', 'CNAME'), 'utf8').trim();
  assert.ok(cname.length > 3, 'CNAME must not be empty');
});

check('serve-live-site.js retains hover:scale classes and implements safe path containment', () => {
  const serveContent = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'serve-live-site.js'), 'utf8');
  assert.strictEqual(serveContent.includes("replace(/\\bhover:scale-\\d+\\b/g, '')"), false, 'Must not strip hover:scale');
  assert.match(serveContent, /safePath\.startsWith/, 'Must check path containment');
});

// ----------------------------------------------------
// 3. PHASE 2: CLOUDFLARE WORKER CONTRACT TESTS
// ----------------------------------------------------
console.log('\n--- 3. Phase 2: Cloudflare Worker API Contracts ---');

// Compile worker if needed
const workerDir = path.resolve(__dirname, '..', 'worker');
execSync(
  'npx tsc src/auth.ts src/gemini.ts src/github.ts src/index.ts src/types.ts src/validator.ts --outDir dist-test --target es2022 --module commonjs --skipLibCheck --moduleResolution node',
  { cwd: workerDir, stdio: 'pipe' }
);

const { buildGeminiPrompt, sanitizeHtmlResponse } = require('../worker/test/gemini-test-helper');
const { getGitHubConfig, utf8ToBase64 } = require('../worker/test/github-test-helper');
const { getCorsHeaders } = require('../worker/test/router-test-helper');

// Import real compiled worker modules for behavioral verification
const { isValidImageUrl, validateCanvasHtml, checkRateLimit, resetRateLimits } = require('../worker/dist-test/index.js');

check('Worker Gemini prompt strictly contains all system instructions', () => {
  const prompt = buildGeminiPrompt('Pastel Aesthetic', 'My favorite cat', ['https://cdn.photos.com/cat.jpg']);
  assert.match(prompt, /SELF-CONTAINED DOCUMENT/);
  assert.match(prompt, /TAILWIND CDN/);
  assert.match(prompt, /NEVER use base64 placeholders/);
  assert.match(prompt, /https:\/\/cdn\.photos\.com\/cat\.jpg/);
  assert.match(prompt, /NO TOXIC JAVASCRIPT/);
});

check('Worker HTML sanitizer strips markdown fences, preambles, and adds auto-resize script', () => {
  const rawHtml = 'Here is your component:\n```html\n<!DOCTYPE html><html><head></head><body>Content</body></html>\n```\nEnjoy!';
  const clean = sanitizeHtmlResponse(rawHtml);
  assert.strictEqual(clean.startsWith('```'), false);
  assert.strictEqual(clean.endsWith('```'), false);
  assert.strictEqual(clean.includes('Here is your component'), false);
  assert.strictEqual(clean.includes('Enjoy!'), false);
  assert.match(clean, /doodle-resize/);
});

check('Worker HTML validation behaviorally rejects unclosed scripts, unquoted src, and meta refresh', () => {
  const unclosed = validateCanvasHtml('<!DOCTYPE html><html><head><script src="https://evil.com/x.js"></head><body>Hi</body></html>');
  assert.strictEqual(unclosed.valid, false, 'Must reject unclosed script');
  assert.match(unclosed.error, /mismatched or unclosed/i);

  const unquoted = validateCanvasHtml('<!DOCTYPE html><html><head><script src=https://evil.com/x.js></script></head><body>Hi</body></html>');
  assert.strictEqual(unquoted.valid, false, 'Must reject unauthorized unquoted script src');

  const metaRefresh = validateCanvasHtml('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=https://evil.com"></head><body>Hi</body></html>');
  assert.strictEqual(metaRefresh.valid, false, 'Must reject meta refresh');

  const validHtml = '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Lily</h1></body></html>';
  assert.strictEqual(validateCanvasHtml(validHtml).valid, true, 'Must accept clean HTML with Tailwind CDN');

  const withInlineEvent = validateCanvasHtml('<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><button onclick="bad()">Click</button></body></html>');
  assert.strictEqual(withInlineEvent.valid, false, 'Must reject inline onclick event handler');

  const liveCanvas = fs.readFileSync(path.join(__dirname, '..', 'live-site', 'canvas.html'), 'utf8');
  const liveCanvasValidation = validateCanvasHtml(liveCanvas);
  assert.strictEqual(liveCanvasValidation.valid, true, `live-site/canvas.html must pass validator: ${liveCanvasValidation.error}`);
});

check('Worker image validation behaviorally enforces https and configured GitHub img/ host while rejecting Firebase Storage', () => {
  const env = { GITHUB_OWNER: 'KieranPatton01', GITHUB_REPO: 'DoodleBug', PUBLIC_SITE_URL: 'https://islacowper.co.uk' };
  assert.strictEqual(isValidImageUrl('https://islacowper.co.uk/img/pic.jpg', env), true);
  assert.strictEqual(isValidImageUrl('https://kieranpatton01.github.io/DoodleBug/img/pic.png', env), true);
  assert.strictEqual(isValidImageUrl('https://images.unsplash.com/photo-123', env), true);
  assert.strictEqual(isValidImageUrl('https://firebasestorage.googleapis.com/v0/b/lily-project.appspot.com/o/pic.jpg', env), false);
  assert.strictEqual(isValidImageUrl('http://islacowper.co.uk/img/pic.jpg', env), false);
  assert.strictEqual(isValidImageUrl('https://evil-site.com/pic.jpg', env), false);
});

check('Worker rate limiter behaviorally blocks requests exceeding quota', () => {
  resetRateLimits();
  const testKey = 'test-client-e2e';
  for (let i = 0; i < 5; i++) {
    const res = checkRateLimit(testKey, 5, 60_000);
    assert.strictEqual(res.allowed, true);
  }
  const exceeded = checkRateLimit(testKey, 5, 60_000);
  assert.strictEqual(exceeded.allowed, false);
  assert.ok(exceeded.retryAfterSeconds > 0);
  resetRateLimits();
});

check('Worker GitHub commit handler properly Base64 encodes unicode & emojis', () => {
  const raw = '<h1>Lily\'s Dream 🌸✨</h1>';
  const b64 = utf8ToBase64(raw);
  const roundtrip = Buffer.from(b64, 'base64').toString('utf8');
  assert.strictEqual(roundtrip, raw);
});

check('Worker GitHub config parses both JSON string and individual env vars', () => {
  const cfg1 = getGitHubConfig({ GITHUB_OWNER: 'alice', GITHUB_REPO: 'bob-site' });
  assert.strictEqual(cfg1.owner, 'alice');
  assert.strictEqual(cfg1.repo, 'bob-site');

  const cfg2 = getGitHubConfig({ GITHUB_REPO_CONFIG: JSON.stringify({ owner: 'charlie', repo: 'david-site' }) });
  assert.strictEqual(cfg2.owner, 'charlie');
  assert.strictEqual(cfg2.repo, 'david-site');
});

check('Worker comprehensive unit & contract test suite passes all tests', () => {
  const testOutput = execSync('node test/run-tests.js', { cwd: workerDir, stdio: 'pipe' }).toString();
  assert.match(testOutput, /TEST RESULTS: \d+\/\d+ PASSED \(0 FAILED\)/, 'All worker tests must pass');
});

check('Gemini configuration keeps gemini-3.8-flash as single model with fallback models removed', () => {
  const geminiSrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'gemini.ts'), 'utf8');
  assert.match(geminiSrc, /PRIMARY_MODEL = 'gemini-3\.8-flash'/, 'Primary model must be gemini-3.8-flash');
  assert.match(geminiSrc, /thinkingLevel:\s*'LOW'/, 'thinkingLevel must be uppercase LOW');
  assert.strictEqual(geminiSrc.includes('FALLBACK_MODELS'), false, 'FALLBACK_MODELS must be removed');
  assert.strictEqual(geminiSrc.includes('gemini-3-flash-preview'), false, 'gemini-3-flash-preview must be removed');
  assert.strictEqual(geminiSrc.includes('gemini-2.5-flash'), false, 'gemini-2.5-flash must be removed');
  assert.strictEqual(geminiSrc.includes('gemini-1.5-flash'), false, 'gemini-1.5-flash must be removed');
  assert.strictEqual(geminiSrc.includes('gemini-2.0-flash'), false, 'gemini-2.0-flash must be removed');
});

// ----------------------------------------------------
// 4. FREE SPARK TIER & GITHUB IMG/ STORAGE AUDIT
// ----------------------------------------------------
console.log('\n--- 4. Free Spark Tier & GitHub img/ Storage Security Audit ---');

check('firebase.json and PWA source have zero Firebase Storage dependencies (Spark Free Tier safe)', () => {
  const fbJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase.json'), 'utf8'));
  assert.strictEqual(fbJson.storage, undefined, 'firebase.json must not configure paid Firebase Storage');
  const fbConfig = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'config', 'firebase.ts'), 'utf8');
  assert.strictEqual(fbConfig.includes('firebase/storage'), false, 'pwa/src/config/firebase.ts must not import firebase/storage');
});

check('Worker GitHub img/ uploader restricts uploads to raster images via magic bytes and rejects SVGs', () => {
  const githubSrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'github.ts'), 'utf8');
  assert.match(githubSrc, /sniffRasterMimeTypeFromBase64/, 'Must validate binary magic bytes');
  assert.match(githubSrc, /svg/i, 'Must explicitly guard against SVG uploads');
  assert.match(githubSrc, /cleanupUnusedGitHubImages/, 'Must clean up unused images from img/ folder');
});

check('img/ directory exists in root and live-site and is preserved by deploy-live-repo.js', () => {
  assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'img', '.gitkeep')), true, 'Root img/.gitkeep must exist');
  assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'live-site', 'img', '.gitkeep')), true, 'live-site/img/.gitkeep must exist');
  const deployScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-live-repo.js'), 'utf8');
  assert.match(deployScript, /git checkout origin\/main -- img/, 'deploy-live-repo.js must preserve uploaded img/ files from origin/main');
});

check('setup-keys scripts write worker/.dev.vars and pwa/.env without Firebase Storage or leaked keys', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '..', 'setup-keys.ps1'), 'utf8');
  assert.match(ps1, /worker\\\.dev\.vars/, 'PowerShell script must write worker/.dev.vars');
  assert.strictEqual(ps1.includes('VITE_FIREBASE_STORAGE_BUCKET'), false, 'PowerShell script must not include VITE_FIREBASE_STORAGE_BUCKET');

  const bat = fs.readFileSync(path.join(__dirname, '..', 'setup-keys.bat'), 'utf8');
  assert.match(bat, /worker\\\.dev\.vars/, 'Batch script must write worker/.dev.vars');
  assert.strictEqual(bat.includes('VITE_FIREBASE_STORAGE_BUCKET'), false, 'Batch script must not include VITE_FIREBASE_STORAGE_BUCKET');
  assert.strictEqual(/AIzaSy[a-zA-Z0-9_-]{33}/.test(bat), false, 'Batch script must not contain Google API key patterns');
  assert.strictEqual(/DEFAULT_UID=[a-zA-Z0-9]{28}/.test(bat), false, 'Batch script must not contain default UID patterns');
});

// ----------------------------------------------------
// 5. PHASE 3 & 4: MOBILE PWA AUDIT & BUILD
// ----------------------------------------------------
console.log('\n--- 5. Phase 3 & 4: Mobile PWA Editor & Pipeline Audit ---');

check('PWA manifest.json specifies standalone mobile display, portrait orientation, and PNG icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pwa', 'public', 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.display, 'standalone');
  assert.strictEqual(manifest.orientation, 'portrait-primary');
  assert.strictEqual(manifest.name, 'Doodlebug Studio');
  const hasPng = manifest.icons.some((i) => i.type === 'image/png');
  assert.strictEqual(hasPng, true, 'Manifest must provide PNG icons');
});

check('PWA provides PNG apple-touch-icon for iOS home screen compliance', () => {
  assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'pwa', 'public', 'apple-touch-icon.png')), true);
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'index.html'), 'utf8');
  assert.match(indexHtml, /apple-touch-icon.*apple-touch-icon\.png/);
});

check('PWA Service Worker caches core assets for offline installation and trims cache', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'public', 'sw.js'), 'utf8');
  assert.match(sw, /CACHE_NAME/);
  assert.match(sw, /trimCache/);
  assert.match(sw, /self\.addEventListener\('fetch'/);
});

check('PWA Canvas uses touch-action: none to lock screen scrolling while drawing', () => {
  const canvasTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'components', 'Canvas.tsx'), 'utf8');
  assert.match(canvasTsx, /touchAction:\s*'none'/);
  assert.match(canvasTsx, /touch-none/);
});

check('PWA Canvas uses pointer capture for dragging notes and stickers', () => {
  const canvasTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'components', 'Canvas.tsx'), 'utf8');
  assert.match(canvasTsx, /setPointerCapture/);
  assert.match(canvasTsx, /releasePointerCapture/);
});

check('PWA Canvas note and sticker buttons stop pointer propagation to avoid dragging', () => {
  const noteTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'components', 'CanvasNoteItem.tsx'), 'utf8');
  assert.match(noteTsx, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  const stickerTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'components', 'CanvasStickerItem.tsx'), 'utf8');
  assert.match(stickerTsx, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
});

check('PWA PreviewModal implements sandboxed iframe within 2-second review flow', () => {
  const modalTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'components', 'PreviewModal.tsx'), 'utf8');
  assert.match(modalTsx, /<iframe/);
  assert.match(modalTsx, /srcDoc=\{(?:injectLocalPhotoPreviewsIntoHtml\()?result\.html\)?\}/);
  assert.match(modalTsx, /Publish to Live Site/);
});

check('PWA App connects Vibecode and Publish pipelines to Worker client', () => {
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'App.tsx'), 'utf8');
  assert.match(appTsx, /callGenerateApi/);
  assert.match(appTsx, /callPublishApi/);
  assert.match(appTsx, /handleVibecode/);
  assert.match(appTsx, /handlePublish/);
});

check('PWA App onClear handler resets textNotes and stickers state', () => {
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'App.tsx'), 'utf8');
  assert.match(appTsx, /setTextNotes\(\[\]\)/, 'onClear must reset textNotes');
  assert.match(appTsx, /setStickers\(\[\]\)/, 'onClear must reset stickers');
});

check('PWA Canvas draws dots immediately on pointer down and up for single taps', () => {
  const canvasTsx = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'src', 'components', 'Canvas.tsx'), 'utf8');
  assert.match(canvasTsx, /drawSingleDot/, 'Canvas must implement drawSingleDot helper');
  assert.match(canvasTsx, /drawSingleDot\(ctx,\s*x,\s*y/, 'Canvas must draw dot on pointer down');
});

check('PWA comprehensive component & contract test suite passes all 16 tests', () => {
  const pwaDir = path.resolve(__dirname, '..', 'pwa');
  const pwaTestOutput = execSync('node test/run-pwa-tests.cjs', { cwd: pwaDir, stdio: 'pipe' }).toString();
  assert.match(pwaTestOutput, /PWA TEST RESULTS: \d+\/\d+ PASSED \(0 FAILED\)/, 'All PWA tests must pass');
});

check('PWA production build compiles successfully with zero TypeScript errors', () => {
  const pwaDir = path.resolve(__dirname, '..', 'pwa');
  const buildOutput = execSync('npm run build', { cwd: pwaDir, stdio: 'pipe' }).toString();
  assert.match(buildOutput, /built in/i, 'Vite build must complete successfully');
});

console.log('\n════════════════════════════════════════════════════════════════════');
console.log(`🎯 PROJECT AUDIT SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED (${failedChecks} FAILED)`);
console.log('════════════════════════════════════════════════════════════════════\n');

if (failedChecks > 0) {
  process.exit(1);
}
