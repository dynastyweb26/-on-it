#!/usr/bin/env node
// Generates the splash reveal's inline ring geometry:
//   public/icons/onit-icon-master.svg  (the shipped app icon — source of truth)
//     → src/components/splash/ring-paths.ts
//
// The icon's white mark is ONE <path> of two subpaths inside
// <g transform="translate(-261.36 -1.26) scale(1.213442)">. The reveal animates
// them as three arcs: subpath 0 whole, and subpath 1 split in two by CLIP (an
// "inner" piece clipped to it and an "outer" piece clipped to its complement),
// so the union is seamless once they lock. Geometry and split are from the
// brand logo-reveal design export (logo-reveal.jsx: RING_PATHS = these two
// subpaths, RING_CLIP = the shape below).
//
// Everything is baked into the 1024x1024 mark box (the group transform is
// applied to the path coordinates) and run through SVGO so the paths can be
// inlined in the page without shipping the ~45 KB raw data.
//
// Usage: npm run splash:paths [-- --precision=0]   (default precision 1)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { optimize } from 'svgo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const precision = Number((process.argv.find((a) => a.startsWith('--precision=')) ?? '--precision=1').split('=')[1]);
const outFile = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1]
  ?? path.join(root, 'src/components/splash/ring-paths.ts');

// ── Ring paths from the shipped icon ─────────────────────────────────────────
const master = await readFile(path.join(root, 'public/icons/onit-icon-master.svg'), 'utf8');
const groupTx = master.match(/<g transform="([^"]+)">\s*<path/)?.[1];
const d = master.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
if (!groupTx || !d) throw new Error('Unexpected onit-icon-master.svg structure');
// Bake the group transform into the coordinates HERE, at full precision. SVGO
// won't do it for us: it skips paths that carry an id (in case they're
// referenced), and it rounds the transform itself to floatPrecision
// (-261.36 → -261.4), which would shift the whole mark.
const tx = groupTx.match(/^translate\((-?[\d.]+)[ ,](-?[\d.]+)\) scale\(([\d.]+)\)$/);
if (!tx) throw new Error(`Unexpected icon group transform: ${groupTx}`);
const [dx, dy, s] = tx.slice(1).map(Number);
if (/[^MCLZ\d.\s,-]/.test(d)) throw new Error('Icon path uses commands other than absolute M/C/L/Z — baking assumes only (x,y) pairs');
let isX = true;
const baked = d.replace(/-?\d*\.?\d+/g, (n) => {
  const v = isX ? Number(n) * s + dx : Number(n) * s + dy;
  isX = !isX;
  return String(+v.toFixed(4));
});
const subpaths = baked.split(/(?=M)/).map((p) => p.trim());
if (subpaths.length !== 2) throw new Error(`Expected 2 subpaths in the icon mark, found ${subpaths.length}`);

// ── The split shape (RING_CLIP) ──────────────────────────────────────────────
// A closed polygon around centre (470,470), sampled every 2°. At 0°–32° and
// 180°–358° it is the circle r=640 (regenerated here exactly); from 34° to 178°
// it follows a hand-tuned line through the gap between the two left arcs. Those
// 73 points are design data, kept verbatim.
const TUNED = [
  [629.2, 577.4], [622.9, 581.1], [616.6, 584.5], [610.2, 587.6], [603.8, 590.4], [597.3, 593], [591.6, 595.9],
  [585.8, 598.6], [580.6, 601.8], [574.7, 604], [569.3, 606.7], [563.4, 608.4], [557.4, 609.9], [552.5, 612.9],
  [547, 614.8], [541.5, 616.5], [536.3, 618.9], [530.7, 620.2], [525.4, 622.2], [520.1, 624.1], [514.9, 626.7],
  [509.2, 627.2], [503.9, 629.4], [498.5, 631.5], [492.8, 632.4], [487.2, 634.1], [481.6, 635.6], [475.8, 636.9],
  [470, 638], [464.1, 639.9], [458.1, 640.6], [451.8, 643], [445.4, 645.3], [439.1, 645.3], [432.4, 647],
  [425.5, 648.5], [418.5, 649.8], [411.3, 650.7], [403.6, 652.3], [395.8, 653.6], [387.8, 654.5], [377.7, 659.2],
  [368.8, 660.3], [360, 660.5], [350.8, 660.8], [341.7, 660.3], [331.6, 660.5], [321, 660.7], [311.2, 659.2],
  [300, 658.8], [288.7, 657.7], [276.9, 656.5], [266, 653.7], [254.7, 650.6], [242.7, 647.6], [230.1, 644.3],
  [219.2, 639.2], [207.5, 634], [197.2, 627.5], [187, 620.5], [177.9, 612.5], [169.4, 603.8], [161.7, 594.6],
  [155.7, 584.4], [150, 574], [146.1, 562.9], [142.5, 551.6], [139.9, 540.2], [139.6, 528.3], [139.7, 516.4],
  [140.8, 504.6], [142.8, 492.9], [146.2, 481.3],
];
const fmt = (n) => String(+n.toFixed(1));
const clipPts = [];
for (let i = 0; i < 180; i++) {
  const deg = i * 2;
  if (deg >= 34 && deg <= 178) { clipPts.push(TUNED[(deg - 34) / 2]); continue; }
  const a = (deg * Math.PI) / 180;
  clipPts.push([470 + 640 * Math.cos(a), 470 + 640 * Math.sin(a)]);
}
const clip = 'M' + clipPts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L') + 'Z';

// ── SVGO ─────────────────────────────────────────────────────────────────────
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
  `<path id="a" d="${subpaths[0]}"/>` +
  `<path id="b" d="${subpaths[1]}"/>` +
  `<path id="clip" d="${clip}"/></svg>`;
const { data } = optimize(svg, {
  multipass: true,
  floatPrecision: precision,
  plugins: [{ name: 'preset-default', params: { overrides: { cleanupIds: false, removeHiddenElems: false } } }],
});
// Any transform left anywhere (path OR wrapping group) means the exported d
// strings would be in the wrong space — fail loudly.
if (/transform=/.test(data)) throw new Error('SVGO output still contains a transform — geometry would be misplaced');
const pathOf = (id) => {
  const m = data.match(new RegExp(`<path[^>]*id="${id}"[^>]*>`))?.[0];
  if (!m) throw new Error(`SVGO output lost path #${id}:\n${data.slice(0, 500)}`);
  return m.match(/\sd="([^"]+)"/)[1];
};
// SVGO may open a path with a relative "m". As a path's first command that's
// identical to "M", but Splash.tsx builds the outer clip by appending RING_CLIP
// after a rectangle's "Z", where a relative "m" would be offset from the
// rectangle's start (-400,-400) and shift the whole complement clip. Force an
// absolute first moveto so every string is safe to concatenate.
const absStart = (p) => p.replace(/^m/, 'M');
const out = { a: absStart(pathOf('a')), b: absStart(pathOf('b')), clip: absStart(pathOf('clip')) };
for (const [k, v] of Object.entries(out)) if (!v.startsWith('M')) throw new Error(`${k} doesn't start with an absolute M`);

const rawBytes = d.length + clip.length; // as shipped in the icon + the clip
const optBytes = out.a.length + out.b.length + out.clip.length;
await writeFile(
  outFile,
  `// GENERATED by scripts/build-splash-paths.mjs from public/icons/onit-icon-master.svg
// (SVGO, floatPrecision ${precision}). Do not edit by hand — run \`npm run splash:paths\`.
// Coordinates are in the 1024x1024 mark box, icon group transform baked in.
/** Ring subpath 0 — the right-hand arc. */
export const RING_A = '${out.a}';
/** Ring subpath 1 — the joined left arcs, split by RING_CLIP into two pieces. */
export const RING_B = '${out.b}';
/** Splits RING_B: pieces use it (inner) and its complement (outer). */
export const RING_CLIP = '${out.clip}';
`,
);
console.log(`precision ${precision}: ${rawBytes} → ${optBytes} bytes of path data → ${path.relative(root, outFile)}`);
