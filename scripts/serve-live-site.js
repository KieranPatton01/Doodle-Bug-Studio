const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const rootDir = path.resolve(__dirname, '..');
const GITHUB_CANVAS_URL = 'https://raw.githubusercontent.com/kieranpatton01/DoodleBug/main/canvas.html';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function syncCanvasFromGitHub() {
  try {
    const res = await fetch(`${GITHUB_CANVAS_URL}?_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const html = await res.text();
      if (html && html.includes('<html')) {
        fs.writeFileSync(path.join(rootDir, 'canvas.html'), html, 'utf8');
        try {
          fs.writeFileSync(path.join(rootDir, 'live-site', 'canvas.html'), html, 'utf8');
        } catch {}
      }
    }
  } catch (err) {
    // Offline fallback: serve local canvas.html
  }
}

const server = http.createServer(async (req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Automatically sync newly published GitHub commit whenever index.html or canvas.html is requested
  if (reqPath === '/canvas.html' || reqPath === '/index.html') {
    await syncCanvasFromGitHub();
  }

  // Safe path containment to prevent directory traversal
  let decodedPath = '/index.html';
  try {
    decodedPath = decodeURIComponent(reqPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }

  const safePath = path.resolve(rootDir, '.' + path.normalize(decodedPath));
  if (!safePath.startsWith(rootDir + path.sep) && safePath !== rootDir) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  const ext = path.extname(safePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  fs.createReadStream(safePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`🌐 Doodlebug Live Site Preview (Auto-Syncing GitHub) running at: http://localhost:${PORT}`);
});
