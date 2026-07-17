// Erzeugt App-Icons (Hufeisen-Symbol in warmem Sand auf dunklem Braun) als PNG, ohne externe Bildbibliothek.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const BG = [33, 29, 23]; // Dunkles Braun
const FG = [222, 176, 122]; // Warmes Sand (gut sichtbar auf kleinen Icons)

// true, wenn Pixel (x,y) zur Hufeisen-Silhouette gehört: Ring mit Öffnung nach unten
// plus zwei kurze "Stollen"-Enden.
function isHorseshoePixel(x, y, size) {
  const cx = size * 0.5;
  const cy = size * 0.46;
  const outerR = size * 0.34;
  const innerR = size * 0.2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 90 = unten

  if (dist <= outerR && dist >= innerR) {
    const gapHalfWidth = 42; // Öffnung unten
    const diff = ((angle - 90 + 540) % 360) - 180;
    if (Math.abs(diff) > gapHalfWidth) return true;
  }

  // Enden ("Stollen") unten links/rechts als kurze gerade Fortsätze
  const endY1 = cy + outerR * 0.62;
  const endY2 = cy + outerR * 1.02;
  const endThickness = (outerR - innerR) / 2;
  for (const endAngleDeg of [90 - 48, 90 + 48]) {
    const rad = (endAngleDeg * Math.PI) / 180;
    const ex = cx + Math.cos(rad) * (outerR + innerR) * 0.5;
    if (Math.abs(x - ex) <= endThickness && y >= endY1 && y <= endY2) return true;
  }

  return false;
}

function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLen = size * 3;
  const raw = Buffer.alloc((rowLen + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowLen + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isHorseshoePixel(x + 0.5, y + 0.5, size) ? FG : BG;
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(outDir, 'icon-192-v1.png'), makePng(192));
fs.writeFileSync(path.join(outDir, 'icon-512-v1.png'), makePng(512));
console.log('Icons erzeugt.');
