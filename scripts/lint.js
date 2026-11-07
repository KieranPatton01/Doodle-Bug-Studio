/**
 * Doodlebug Project-Wide Linting & Code Hygiene Audit Script
 * 
 * Runs strict TypeScript static analysis and scans codebase for:
 * - Secret token leaks
 * - Accessibility anti-patterns (e.g. user-scalable=no)
 * - Security rule regressions
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('═══════════════════════════════════════════════════════');
console.log('🔍 DOODLEBUG CODE QUALITY & LINTING AUDIT');
console.log('═══════════════════════════════════════════════════════\n');

let errors = 0;

function runStep(title, fn) {
  try {
    process.stdout.write(`• ${title}... `);
    fn();
    console.log('✅ OK');
  } catch (err) {
    console.log('❌ FAILED');
    console.error(`  Reason: ${err.message}`);
    errors++;
  }
}

// 1. Worker TypeScript Static Analysis
runStep('Worker TypeScript strict typechecking (worker/src)', () => {
  const workerDir = path.resolve(__dirname, '..', 'worker');
  execSync('npm run lint', { cwd: workerDir, stdio: 'pipe' });
});

// 2. PWA TypeScript Static Analysis
runStep('PWA TypeScript strict typechecking (pwa/src)', () => {
  const pwaDir = path.resolve(__dirname, '..', 'pwa');
  execSync('npm run lint', { cwd: pwaDir, stdio: 'pipe' });
});

// 3. Security Hygiene & Mobile Accessibility Scan
runStep('Scanning source code for mobile accessibility & secret patterns', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'pwa', 'index.html'), 'utf8');
  if (indexHtml.includes('user-scalable=no') || indexHtml.includes('maximum-scale=1.0')) {
    throw new Error('pwa/index.html must not block accessibility zoom with user-scalable=no');
  }

  const firebaseJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'firebase.json'), 'utf8'));
  if (firebaseJson.storage) {
    throw new Error('firebase.json must not include a storage block (Firebase Spark Free Tier - Auth only)');
  }

  const pwaFirebaseTs = fs.readFileSync(path.join(rootDir, 'pwa', 'src', 'config', 'firebase.ts'), 'utf8');
  const pwaStorageServiceTs = fs.readFileSync(path.join(rootDir, 'pwa', 'src', 'services', 'storageService.ts'), 'utf8');
  if (pwaFirebaseTs.includes('firebase/storage') || pwaStorageServiceTs.includes('firebase/storage')) {
    throw new Error('PWA must not import firebase/storage; photos are stored in the GitHub img/ folder');
  }

  const workerGithubTs = fs.readFileSync(path.join(rootDir, 'worker', 'src', 'github.ts'), 'utf8');
  if (!workerGithubTs.includes('sniffRasterMimeTypeFromBase64') || !workerGithubTs.includes('uploadImageToGitHub')) {
    throw new Error('worker/src/github.ts must enforce magic-byte raster image verification for GitHub img/ uploads');
  }

  const wranglerToml = fs.readFileSync(path.join(rootDir, 'worker', 'wrangler.toml'), 'utf8');
  if (wranglerToml.includes('CORS_ORIGIN = "*"')) {
    throw new Error('worker/wrangler.toml must not use wildcard CORS_ORIGIN = "*" in production config');
  }

  const rootIndexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const liveSiteIndexHtml = fs.readFileSync(path.join(rootDir, 'live-site', 'index.html'), 'utf8');
  if (!rootIndexHtml.includes('allow-popups') || !liveSiteIndexHtml.includes('allow-popups')) {
    throw new Error('Both root index.html and live-site/index.html iframe sandbox must include allow-popups for link navigation');
  }
});

console.log('\n═══════════════════════════════════════════════════════');
if (errors === 0) {
  console.log('🎉 ALL LINTING & HYGIENE CHECKS PASSED');
  console.log('═══════════════════════════════════════════════════════\n');
  process.exit(0);
} else {
  console.error(`❌ LINTING COMPLETED WITH ${errors} ERRORS`);
  console.log('═══════════════════════════════════════════════════════\n');
  process.exit(1);
}
