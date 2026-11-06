const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG Encoder using standard Node.js zlib
function createPng(width, height, getPixel) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x / width, y / height, x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      for (let j = 0; j < 8; j++) {
        let bit = (crc ^ byte) & 1;
        crc = (crc >>> 1) ^ (bit ? 0xEDB88320 : 0);
        byte >>>= 1;
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function makeChunk(type, data) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  return Buffer.concat([
    header,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', zlib.deflateSync(rawData)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------
// Icon 1: Doodlebug Studio (Artist Paintbrush & Palette)
// ----------------------------------------------------
function renderStudioPixel(u, v) {
  // Rounded squircle background (#FFFDF5)
  const bg = [255, 253, 245, 255];
  const border = [30, 41, 59, 255];
  const pink = [255, 214, 232, 255];
  const eye = [15, 23, 42, 255];
  const white = [255, 255, 255, 255];
  const blush = [244, 114, 182, 255];
  const cyan = [56, 189, 248, 255];
  const coral = [244, 63, 94, 255];

  const cx = u - 0.5;
  const cy = v - 0.52;
  const dist = Math.sqrt(cx * cx + cy * cy);

  // Outer circle badge (r=0.40)
  if (dist > 0.40) {
    // Check antennae
    const leftAntenna = Math.sqrt((u - 0.32) ** 2 + (v - 0.14) ** 2);
    if (leftAntenna < 0.045) return cyan;
    const rightAntenna = Math.sqrt((u - 0.68) ** 2 + (v - 0.14) ** 2);
    if (rightAntenna < 0.045) return coral;
    return bg;
  }

  if (dist > 0.38) return border;

  // Eyes (cx: 0.38, 0.62, cy: 0.44)
  const leftEye = Math.sqrt((u - 0.38) ** 2 + (v - 0.46) ** 2);
  const rightEye = Math.sqrt((u - 0.62) ** 2 + (v - 0.46) ** 2);

  // Eye highlights
  const leftPupil = Math.sqrt((u - 0.39) ** 2 + (v - 0.44) ** 2);
  const rightPupil = Math.sqrt((u - 0.63) ** 2 + (v - 0.44) ** 2);
  if (leftPupil < 0.02 || rightPupil < 0.02) return white;

  if (leftEye < 0.055 || rightEye < 0.055) return eye;

  // Blush
  const leftBlush = Math.sqrt(((u - 0.28) / 1.5) ** 2 + (v - 0.56) ** 2);
  const rightBlush = Math.sqrt(((u - 0.72) / 1.5) ** 2 + (v - 0.56) ** 2);
  if (leftBlush < 0.045 || rightBlush < 0.045) return blush;

  // Smile (arc around cy 0.56)
  if (v >= 0.56 && v <= 0.66 && Math.abs(u - 0.5) <= 0.14) {
    const smileY = 0.56 + (u - 0.5) * (u - 0.5) * 5.0;
    if (Math.abs(v - smileY) < 0.018) return border;
  }

  // Paintbrush tip bottom-right (artist emblem)
  const tipDist = Math.sqrt((u - 0.76) ** 2 + (v - 0.76) ** 2);
  if (tipDist < 0.07) return cyan;

  return pink;
}

// ----------------------------------------------------
// Icon 2: Doodlebug Live Website (Showcase Globe & Golden Star)
// ----------------------------------------------------
function renderLivePixel(u, v) {
  const bg = [255, 253, 245, 255];
  const border = [6, 78, 59, 255];
  const mint = [209, 250, 229, 255];
  const dark = [15, 23, 42, 255];
  const white = [255, 255, 255, 255];
  const gold = [245, 158, 11, 255];
  const emerald = [16, 185, 129, 255];

  const cx = u - 0.5;
  const cy = v - 0.52;
  const dist = Math.sqrt(cx * cx + cy * cy);

  // Top sparkling star
  const starDist = Math.sqrt((u - 0.5) ** 2 + (v - 0.12) ** 2);
  if (starDist < 0.055) return gold;

  if (dist > 0.40) {
    // Antenna stem
    if (Math.abs(u - 0.5) < 0.018 && v >= 0.12 && v <= 0.22) return border;
    return bg;
  }

  if (dist > 0.38) return border;

  // Chic round glasses frames around eyes
  const leftGlass = Math.sqrt((u - 0.36) ** 2 + (v - 0.46) ** 2);
  const rightGlass = Math.sqrt((u - 0.64) ** 2 + (v - 0.46) ** 2);

  // Bridge between glasses
  if (Math.abs(v - 0.46) < 0.016 && u >= 0.42 && u <= 0.58) return dark;

  // Glasses rims
  if ((leftGlass >= 0.065 && leftGlass <= 0.085) || (rightGlass >= 0.065 && rightGlass <= 0.085)) {
    return dark;
  }

  // Eye highlights
  const leftPupil = Math.sqrt((u - 0.37) ** 2 + (v - 0.44) ** 2);
  const rightPupil = Math.sqrt((u - 0.65) ** 2 + (v - 0.44) ** 2);
  if (leftPupil < 0.018 || rightPupil < 0.018) return white;

  // Eyes inside glasses
  if (leftGlass < 0.05 || rightGlass < 0.05) return dark;

  // Smile
  if (v >= 0.58 && v <= 0.67 && Math.abs(u - 0.5) <= 0.13) {
    const smileY = 0.58 + (u - 0.5) * (u - 0.5) * 5.0;
    if (Math.abs(v - smileY) < 0.018) return border;
  }

  // Live star emblem on cheek/badge
  const emblemDist = Math.sqrt((u - 0.74) ** 2 + (v - 0.74) ** 2);
  if (emblemDist < 0.065) return emerald;
  const innerGold = Math.sqrt((u - 0.74) ** 2 + (v - 0.74) ** 2);
  if (innerGold < 0.035) return gold;

  return mint;
}

// Studio SVG markup
const studioSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="28" fill="#FFFDF5"/>
  <circle cx="50" cy="52" r="38" fill="#FFD6E8" stroke="#1E293B" stroke-width="4"/>
  <!-- Paint antenna -->
  <path d="M 35 24 Q 42 12 32 12" fill="transparent" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/>
  <path d="M 65 24 Q 58 12 68 12" fill="transparent" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/>
  <circle cx="32" cy="12" r="4.5" fill="#38BDF8"/>
  <circle cx="68" cy="12" r="4.5" fill="#F43F5E"/>
  <!-- Eyes -->
  <circle cx="38" cy="46" r="5.5" fill="#0F172A"/>
  <circle cx="62" cy="46" r="5.5" fill="#0F172A"/>
  <circle cx="39" cy="44" r="2" fill="#FFFFFF"/>
  <circle cx="63" cy="44" r="2" fill="#FFFFFF"/>
  <!-- Blush -->
  <ellipse cx="28" cy="56" rx="5" ry="3" fill="#F472B6" opacity="0.8"/>
  <ellipse cx="72" cy="56" rx="5" ry="3" fill="#F472B6" opacity="0.8"/>
  <!-- Smile -->
  <path d="M 40 58 Q 50 68 60 58" fill="transparent" stroke="#1E293B" stroke-width="3.5" stroke-linecap="round"/>
  <!-- Artist Palette Emblem -->
  <circle cx="76" cy="76" r="7" fill="#38BDF8"/>
</svg>`;

// Live Site SVG markup
const liveSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="28" fill="#FFFDF5"/>
  <circle cx="50" cy="52" r="38" fill="#D1FAE5" stroke="#064E3B" stroke-width="4"/>
  <!-- Star Antenna -->
  <line x1="50" y1="24" x2="50" y2="14" stroke="#064E3B" stroke-width="3" stroke-linecap="round"/>
  <polygon points="50,8 52,12 56,12 53,15 54,19 50,16 46,19 47,15 44,12 48,12" fill="#F59E0B"/>
  <!-- Chic Glasses -->
  <circle cx="36" cy="46" r="7.5" fill="none" stroke="#0F172A" stroke-width="2.5"/>
  <circle cx="64" cy="46" r="7.5" fill="none" stroke="#0F172A" stroke-width="2.5"/>
  <line x1="43.5" y1="46" x2="56.5" y2="46" stroke="#0F172A" stroke-width="2.5"/>
  <!-- Eyes -->
  <circle cx="36" cy="46" r="4.5" fill="#0F172A"/>
  <circle cx="64" cy="46" r="4.5" fill="#0F172A"/>
  <circle cx="37" cy="44.5" r="1.5" fill="#FFFFFF"/>
  <circle cx="65" cy="44.5" r="1.5" fill="#FFFFFF"/>
  <!-- Smile -->
  <path d="M 41 60 Q 50 68 59 60" fill="transparent" stroke="#064E3B" stroke-width="3.5" stroke-linecap="round"/>
  <!-- Live Showcase Star Emblem -->
  <circle cx="76" cy="76" r="7.5" fill="#10B981"/>
  <circle cx="76" cy="76" r="3.5" fill="#F59E0B"/>
</svg>`;

const rootDir = path.resolve(__dirname, '..');
const pwaPublic = path.join(rootDir, 'pwa', 'public');
const liveSiteDir = path.join(rootDir, 'live-site');

console.log('Generating Studio PWA Icons (pwa/public)...');
fs.writeFileSync(path.join(pwaPublic, 'favicon.svg'), studioSvg, 'utf8');
fs.writeFileSync(path.join(pwaPublic, 'apple-touch-icon.png'), createPng(180, 180, renderStudioPixel));
fs.writeFileSync(path.join(pwaPublic, 'icon-192.png'), createPng(192, 192, renderStudioPixel));
fs.writeFileSync(path.join(pwaPublic, 'icon-512.png'), createPng(512, 512, renderStudioPixel));
console.log('✅ Studio PWA icons generated.');

console.log('Generating Live Site PWA Icons (live-site & root)...');
[liveSiteDir, rootDir].forEach((dir) => {
  fs.writeFileSync(path.join(dir, 'favicon.svg'), liveSvg, 'utf8');
  fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), createPng(180, 180, renderLivePixel));
  fs.writeFileSync(path.join(dir, 'icon-192.png'), createPng(192, 192, renderLivePixel));
  fs.writeFileSync(path.join(dir, 'icon-512.png'), createPng(512, 512, renderLivePixel));
});
console.log('✅ Live Site PWA icons generated.');
