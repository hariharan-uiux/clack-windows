/**
 * Generates build/icon.png (512²) and build/tray.png (32²) from signed-distance
 * shapes, so the app ships crisp icons without any binary asset pipeline.
 *
 * Run with: npm run icons
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'build');
const SS = 3; // supersampling factor

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

function render(size, draw) {
  const big = size * SS;
  const data = new Float32Array(big * big * 4);

  const blend = (x, y, [r, g, b], alpha) => {
    if (alpha <= 0) return;
    const i = (y * big + x) * 4;
    const src = alpha;
    const dst = data[i + 3] * (1 - src);
    const out = src + dst;
    if (out <= 0) return;
    data[i] = (r * src + data[i] * data[i + 3] * (1 - src)) / out;
    data[i + 1] = (g * src + data[i + 1] * data[i + 3] * (1 - src)) / out;
    data[i + 2] = (b * src + data[i + 2] * data[i + 3] * (1 - src)) / out;
    data[i + 3] = out;
  };

  const shapes = [];
  draw({
    roundRect: (cx, cy, hw, hh, radius, color, alpha = 1, stroke = 0) =>
      shapes.push({ kind: 'rrect', cx, cy, hw, hh, radius, color: hexToRgb(color), alpha, stroke }),
    circle: (cx, cy, radius, color, alpha = 1) =>
      shapes.push({ kind: 'circle', cx, cy, radius, color: hexToRgb(color), alpha }),
    background: (colorTop, colorBottom) =>
      shapes.push({ kind: 'gradient', top: hexToRgb(colorTop), bottom: hexToRgb(colorBottom) }),
  });

  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      for (const shape of shapes) {
        if (shape.kind === 'gradient') continue;
        if (shape.kind === 'circle') {
          const d = Math.hypot(px - shape.cx, py - shape.cy) - shape.radius;
          blend(x, y, shape.color, clamp01(0.5 - d) * shape.alpha);
          continue;
        }
        const d = sdRoundRect(px, py, shape.cx, shape.cy, shape.hw, shape.hh, shape.radius);
        if (shape.stroke > 0) {
          const edge = Math.abs(d) - shape.stroke / 2;
          blend(x, y, shape.color, clamp01(0.5 - edge) * shape.alpha);
        } else {
          blend(x, y, shape.color, clamp01(0.5 - d) * shape.alpha);
        }
      }
    }
  }

  // box downsample
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          const alpha = data[i + 3];
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += alpha;
        }
      }
      const count = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / count) * 255);
    }
  }
  return encodePng(size, size, out);
}

function drawAppIcon(painter) {
  painter.background('#141418', '#0a0a0c');
  // keycap body
  painter.roundRect(512, 512, 300, 300, 108, '#f4f4f5');
  // keycap shading
  painter.roundRect(512, 540, 300, 272, 108, '#d9d9de', 0.55);
  painter.roundRect(512, 540, 300, 272, 108, '#111114', 0.06);
  // sound bars on the cap
  const bars = [
    { x: 412, h: 96 },
    { x: 512, h: 168 },
    { x: 612, h: 120 },
  ];
  for (const bar of bars) {
    painter.roundRect(bar.x, 512, 30, bar.h / 2, 30, bar.x === 512 ? '#0f7a55' : '#1b1b1f');
  }
}

function drawTrayIcon(painter) {
  painter.roundRect(16, 16, 15, 15, 5, '#fafafa');
  painter.roundRect(8.5, 16, 1.8, 5, 1.8, '#0a0a0c');
  painter.roundRect(16, 16, 1.8, 9, 1.8, '#0a0a0c');
  painter.roundRect(23.5, 16, 1.8, 6.5, 1.8, '#0a0a0c');
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), render(512, drawAppIcon));
fs.writeFileSync(path.join(outDir, 'tray.png'), render(32, drawTrayIcon));
console.log('wrote build/icon.png and build/tray.png');
