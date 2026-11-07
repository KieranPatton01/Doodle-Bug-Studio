const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const rootDir = path.resolve(__dirname, '..');
const LIVE_CANVAS_URL = 'https://islacowper.co.uk/canvas.html';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let lastRemoteModified = null;
let lastRemoteHtml = null;

async function syncCanvasFromLiveSite() {
  try {
    const res = await fetch(`${LIVE_CANVAS_URL}?_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const lastMod = res.headers.get('Last-Modified');
      if (lastMod) lastRemoteModified = lastMod;
      const html = await res.text();
      if (html && html.includes('<html')) {
        // Keep in memory only so git-tracked template files are never dirtied
        lastRemoteHtml = html.replace(/<script>\(function\(\)\{function c\(\)\{[\s\S]*?<\/script>/g, '');
      }
    }
  } catch (err) {
    // Offline fallback: serve local canvas.html
  }
}

const server = http.createServer(async (req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Automatically sync newly published live site whenever index.html or canvas.html is requested
  if (reqPath === '/canvas.html' || reqPath === '/index.html') {
    await syncCanvasFromLiveSite();
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

  const stat = fs.statSync(safePath);
  const ext = path.extname(safePath).toLowerCase();
  const lastModifiedHeader =
    (reqPath === '/canvas.html' && lastRemoteModified) || stat.mtime.toUTCString();

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': lastModifiedHeader,
  });
  if (reqPath === '/canvas.html' && lastRemoteHtml) {
    return res.end(lastRemoteHtml, 'utf8');
  }
  fs.createReadStream(safePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`🌐 Doodlebug Live Site Preview running at: http://localhost:${PORT}`);
});
