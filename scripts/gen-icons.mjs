/**
 * Generates build/icon.png (512²) and build/tray.png (32²) from signed-distance
 * shapes, supersampled for crisp, subpixel antialiasing and realistic depth.
 *
 * Design:
 * - 3D tactile artisan mechanical keycap with ergonomic spherical dish.
 * - Multi-layer ambient drop shadow and precision chamfer highlights.
 * - Centerpiece: 3-bar acoustic waveform / mechanical strike motif.
 *   Hero center bar in Clack's signature vibrant industrial orange (#f97316),
 *   flanked by charcoal/titanium strike bars and an ambient neon glow.
 * - System tray icon: 32² high-contrast keycap with aligned acoustic bars
 *   for 16px/32px Windows taskbar clarity.
 *
 * Run with: npm run icons
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'build');

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
  ihdr[8] = 8;
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

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const lerp = (a, b, t) => a + (b - a) * t;

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function colorGradient(y, y0, y1, color0, color1) {
  const t = clamp01((y - y0) / (y1 - y0));
  const c0 = typeof color0 === 'string' ? hexToRgb(color0) : color0;
  const c1 = typeof color1 === 'string' ? hexToRgb(color1) : color1;
  return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
}

function radialColorGradient(x, y, cx, cy, r0, r1, color0, color1) {
  const d = Math.hypot(x - cx, y - cy);
  const t = clamp01((d - r0) / (r1 - r0));
  const c0 = typeof color0 === 'string' ? hexToRgb(color0) : color0;
  const c1 = typeof color1 === 'string' ? hexToRgb(color1) : color1;
  return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
}

function renderCanvas(size, drawFn, supersample = 2) {
  const SS = supersample;
  const big = size * SS;
  const data = new Float32Array(big * big * 4);

  const blend = (x, y, r, g, b, alpha) => {
    if (alpha <= 0.001) return;
    const i = (y * big + x) * 4;
    const src = Math.min(1, Math.max(0, alpha));
    const dstA = data[i + 3];
    const outA = src + dstA * (1 - src);
    if (outA <= 0.0001) return;
    data[i] = (r * src + data[i] * dstA * (1 - src)) / outA;
    data[i + 1] = (g * src + data[i + 1] * dstA * (1 - src)) / outA;
    data[i + 2] = (b * src + data[i + 2] * dstA * (1 - src)) / outA;
    data[i + 3] = outA;
  };

  const layers = [];

  const ctx = {
    roundRect({ cx, cy, hw, hh, r, fill, stroke = 0, strokeColor = null, opacity = 1 }) {
      layers.push({
        type: 'rrect',
        cx: cx * SS,
        cy: cy * SS,
        hw: hw * SS,
        hh: hh * SS,
        r: r * SS,
        fill,
        stroke: stroke * SS,
        strokeColor,
        opacity,
      });
    },
    pill({ cx, cy, hw, hh, fill, stroke = 0, strokeColor = null, opacity = 1 }) {
      const r = Math.min(hw, hh);
      layers.push({
        type: 'rrect',
        cx: cx * SS,
        cy: cy * SS,
        hw: hw * SS,
        hh: hh * SS,
        r: r * SS,
        fill,
        stroke: stroke * SS,
        strokeColor,
        opacity,
      });
    },
    radialGlow({ cx, cy, radius, color, maxAlpha = 0.3 }) {
      layers.push({
        type: 'glow',
        cx: cx * SS,
        cy: cy * SS,
        radius: radius * SS,
        rgb: typeof color === 'string' ? hexToRgb(color) : color,
        maxAlpha,
      });
    },
  };

  drawFn(ctx);

  for (let y = 0; y < big; y += 1) {
    const py = y + 0.5;
    for (let x = 0; x < big; x += 1) {
      const px = x + 0.5;

      for (let l = 0; l < layers.length; l += 1) {
        const item = layers[l];

        if (item.type === 'glow') {
          const d = Math.hypot(px - item.cx, py - item.cy);
          if (d < item.radius) {
            const t = d / item.radius;
            const a = item.maxAlpha * (1 - t * t);
            blend(x, y, item.rgb[0], item.rgb[1], item.rgb[2], a);
          }
          continue;
        }

        if (item.type === 'rrect') {
          const d = sdRoundRect(px, py, item.cx, item.cy, item.hw, item.hh, item.r);

          if (item.stroke > 0 && item.strokeColor) {
            const edge = Math.abs(d) - item.stroke / 2;
            const alpha = clamp01(0.5 - edge) * item.opacity;
            if (alpha > 0.001) {
              const c = typeof item.strokeColor === 'function' ? item.strokeColor(px / SS, py / SS) : item.strokeColor;
              blend(x, y, c[0], c[1], c[2], alpha);
            }
          }

          if (item.fill) {
            const alpha = clamp01(0.5 - d) * item.opacity;
            if (alpha > 0.001) {
              const c = typeof item.fill === 'function' ? item.fill(px / SS, py / SS) : item.fill;
              blend(x, y, c[0], c[1], c[2], alpha);
            }
          }
        }
      }
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const factor = 1 / (SS * SS);

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

      const o = (y * size + x) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a * factor * 255);
    }
  }

  return encodePng(size, size, out);
}

function drawAppIcon(ctx) {
  const cx = 256;
  const cy = 250;
  const hw = 208;
  const hh = 208;
  const r = 96;

  // 1. Soft multi-tier ambient drop shadow
  const shadows = [
    { dy: 18, alpha: 0.04, spread: 8 },
    { dy: 14, alpha: 0.06, spread: 6 },
    { dy: 10, alpha: 0.08, spread: 4 },
    { dy: 6, alpha: 0.12, spread: 2 },
    { dy: 3, alpha: 0.18, spread: 0 },
  ];
  for (const s of shadows) {
    ctx.roundRect({
      cx,
      cy: cy + s.dy,
      hw: hw + s.spread,
      hh: hh + s.spread,
      r: r + s.spread,
      fill: [0, 0, 0],
      opacity: s.alpha,
    });
  }

  // 2. Keycap Base Skirt / 3D Mechanical Depth
  ctx.roundRect({
    cx,
    cy: cy + 12,
    hw,
    hh: hh - 6,
    r,
    fill: (x, y) => colorGradient(y, cy + hh - 80, cy + hh + 6, '#c4c8d2', '#9398a6'),
  });

  // 3. Main Keycap Top Face with Chamfer
  const capTop = cy - hh;
  const capBottom = cy + hh - 8;
  ctx.roundRect({
    cx,
    cy: (capTop + capBottom) / 2,
    hw,
    hh: (capBottom - capTop) / 2,
    r,
    fill: (x, y) => colorGradient(y, capTop, capBottom, '#ffffff', '#e2e5eb'),
    stroke: 2,
    strokeColor: (x, y) => colorGradient(y, capTop, capBottom, '#ffffff', '#c5cad6'),
  });

  // 4. Ergonomic Sculpted Keycap Dish (Spherical Recess)
  const dishW = 164;
  const dishH = 158;
  const dishCy = cy - 2;
  const dishR = 72;

  ctx.roundRect({
    cx,
    cy: dishCy,
    hw: dishW,
    hh: dishH,
    r: dishR,
    fill: (x, y) => radialColorGradient(x, y, cx, dishCy - 15, 20, 200, '#fafafc', '#e6e8ee'),
    stroke: 1.5,
    strokeColor: (x, y) => colorGradient(y, dishCy - dishH, dishCy + dishH, '#d2d6df', '#ffffff'),
  });

  // 5. Soundwave / Acoustic Strike Centerpiece
  const glyphCy = dishCy;

  // Multi-tier radiant orange bloom around central bar
  ctx.radialGlow({ cx, cy: glyphCy, radius: 140, color: '#f97316', maxAlpha: 0.08 });
  ctx.radialGlow({ cx, cy: glyphCy, radius: 95, color: '#f97316', maxAlpha: 0.16 });
  ctx.radialGlow({ cx, cy: glyphCy, radius: 55, color: '#fb923c', maxAlpha: 0.28 });

  const barW = 19;
  const spacing = 74;

  // Left Bar: Height = 112px (Tactile key press / left click)
  const lbH = 56;
  ctx.pill({
    cx: cx - spacing,
    cy: glyphCy,
    hw: barW,
    hh: lbH,
    fill: (x, y) => colorGradient(y, glyphCy - lbH, glyphCy + lbH, '#2b2c34', '#131418'),
    stroke: 1.5,
    strokeColor: (x, y) => colorGradient(y, glyphCy - lbH, glyphCy + lbH, '#424450', '#0a0a0c'),
  });

  // Right Bar: Height = 140px (Tactile key release / right click)
  const rbH = 70;
  ctx.pill({
    cx: cx + spacing,
    cy: glyphCy,
    hw: barW,
    hh: rbH,
    fill: (x, y) => colorGradient(y, glyphCy - rbH, glyphCy + rbH, '#2b2c34', '#131418'),
    stroke: 1.5,
    strokeColor: (x, y) => colorGradient(y, glyphCy - rbH, glyphCy + rbH, '#424450', '#0a0a0c'),
  });

  // Center Hero Bar: Height = 192px (Vibrant Industrial Orange #f97316)
  const cbH = 96;
  ctx.pill({
    cx,
    cy: glyphCy,
    hw: barW,
    hh: cbH,
    fill: (x, y) => colorGradient(y, glyphCy - cbH, glyphCy + cbH, '#ffac3b', '#db4605'),
    stroke: 1.5,
    strokeColor: (x, y) => colorGradient(y, glyphCy - cbH, glyphCy + cbH, '#ffe0a6', '#9c2f02'),
  });
}

function drawTrayIcon(ctx) {
  const cx = 16;
  const cy = 16;
  const hw = 14;
  const hh = 14;
  const r = 6.5;

  // Clean white keycap base
  ctx.roundRect({
    cx,
    cy,
    hw,
    hh,
    r,
    fill: [255, 255, 255],
    stroke: 1,
    strokeColor: [215, 218, 225],
  });

  const barW = 1.5;
  const spacing = 5.5;

  // Left bar
  ctx.pill({
    cx: cx - spacing,
    cy,
    hw: barW,
    hh: 4.5,
    fill: hexToRgb('#141418'),
  });

  // Right bar
  ctx.pill({
    cx: cx + spacing,
    cy,
    hw: barW,
    hh: 6.0,
    fill: hexToRgb('#141418'),
  });

  // Center bar in bold industrial orange
  ctx.pill({
    cx,
    cy,
    hw: barW,
    hh: 8.0,
    fill: hexToRgb('#f97316'),
  });
}

fs.mkdirSync(outDir, { recursive: true });
console.time('build/icon.png');
fs.writeFileSync(path.join(outDir, 'icon.png'), renderCanvas(512, drawAppIcon, 2));
console.timeEnd('build/icon.png');

console.time('build/tray.png');
fs.writeFileSync(path.join(outDir, 'tray.png'), renderCanvas(32, drawTrayIcon, 3));
console.timeEnd('build/tray.png');

console.log('wrote build/icon.png (512x512) and build/tray.png (32x32)');
