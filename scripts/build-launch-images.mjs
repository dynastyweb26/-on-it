#!/usr/bin/env node
// Generates the iOS launch screens (apple-touch-startup-image):
//   src/lib/launch-screens.json → public/splash/launch-<W>x<H>.png
//
// Plain cream, no mark: iOS shows these before any of our JS or CSS runs, and
// an empty cream frame is the only thing that matches the page's first paint
// (cream html background) exactly on every device. Without them iOS shows a
// black/blank screen for ~0.5s on an installed-PWA cold start.
//
// Pure Node (zlib), no dependencies. Images are 1-bit palette PNGs with a
// single palette entry = the launch colour, so every pixel is exactly that
// colour and each file is a few hundred bytes. No colour-profile chunks: PNG
// without them is sRGB, the same space as the CSS hex, so no shift.
//
// Usage: npm run launch:build
import { deflateSync } from 'node:zlib';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'src/lib/launch-screens.json'), 'utf8'));
const outDir = path.join(root, 'public/splash');

const hex = config.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
if (!hex) throw new Error(`color must be #rrggbb, got ${config.color}`);
const rgb = hex.slice(1).map((h) => parseInt(h, 16));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function solidPng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // bit depth 1
  ihdr[9] = 3; // colour type 3: indexed
  // compression 0, filter 0, interlace 0 (already zeroed)
  // Each scanline: filter byte 0 + ceil(width/8) bytes of index 0 → all palette[0].
  const raw = Buffer.alloc((1 + Math.ceil(width / 8)) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(rgb)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Clean rebuild so a device removed from the JSON doesn't leave a stale PNG.
await mkdir(outDir, { recursive: true });
for (const f of await readdir(outDir)) if (/^launch-\d+x\d+\.png$/.test(f)) await rm(path.join(outDir, f));

let total = 0, count = 0;
const seen = new Set();
for (const { w, h, dpr } of config.screens) {
  for (const [pw, ph] of [[w * dpr, h * dpr], [h * dpr, w * dpr]]) { // portrait, landscape
    const name = `launch-${pw}x${ph}.png`;
    if (seen.has(name)) continue; // same pixel size shared by two entries
    seen.add(name);
    const png = solidPng(pw, ph);
    await writeFile(path.join(outDir, name), png);
    total += png.length;
    count++;
  }
}
console.log(`${count} launch images (${config.color}) → public/splash/, ${total} bytes total`);
