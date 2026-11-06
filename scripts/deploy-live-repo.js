const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const liveSiteDir = path.join(rootDir, 'live-site');
const tempDir = path.join(os.tmpdir(), 'doodlebug-live-deploy');

if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

// Copy live-site files to tempDir
fs.cpSync(liveSiteDir, tempDir, { recursive: true });

console.log('Deploying live site files from', tempDir);
execSync('git init', { cwd: tempDir, stdio: 'inherit' });
execSync('git config user.name "Kieran Patton"', { cwd: tempDir, stdio: 'inherit' });
execSync('git config user.email "kieranpatton01@users.noreply.github.com"', { cwd: tempDir, stdio: 'inherit' });
execSync('git remote add origin https://github.com/KieranPatton01/DoodleBug.git', { cwd: tempDir, stdio: 'inherit' });
execSync('git add .', { cwd: tempDir, stdio: 'inherit' });
execSync('git commit -m "feat: Doodlebug live showcase website (PWA)"', { cwd: tempDir, stdio: 'inherit' });
execSync('git branch -M main', { cwd: tempDir, stdio: 'inherit' });
execSync('git push origin main --force', { cwd: tempDir, stdio: 'inherit' });

console.log('Cleanup tempDir...');
fs.rmSync(tempDir, { recursive: true, force: true });
console.log('✅ Successfully deployed live-site files to https://github.com/KieranPatton01/DoodleBug.git!');
