#!/usr/bin/env node
// Regenerates the self-hosted Material Symbols subset:
//   src/components/icon-names.ts  (the list, source of truth)
//     → src/fonts/material-symbols-outlined.woff2
//
// Why: the full variable Material Symbols font is ~4 MB and was loaded from a
// render-blocking Google Fonts stylesheet on every cold start. The subset holds
// only the icons we render, on the axes we use (opsz 24, wght 400, GRAD 0,
// FILL 0..1 for the filled active states) — a few KB.
//
// Usage: npm run icons:build   (needs network; Node 18+ for global fetch)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const namesFile = path.join(root, 'src/components/icon-names.ts');
const outFile = path.join(root, 'src/fonts/material-symbols-outlined.woff2');

const src = await readFile(namesFile, 'utf8');
const block = src.match(/ICON_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!block) throw new Error(`Could not find ICON_NAMES in ${namesFile}`);
const names = [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
if (names.length === 0) throw new Error('ICON_NAMES is empty');

// Google Fonts requires icon_names to be sorted and unique.
const sorted = [...new Set(names)].sort();
if (sorted.length !== names.length) throw new Error('ICON_NAMES has duplicates');

const cssUrl =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0' +
  `&icon_names=${sorted.join(',')}&display=block`;
// A modern UA, or Google Fonts serves a non-woff2 format.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': UA } });
if (!cssRes.ok) throw new Error(`Google Fonts CSS request failed: ${cssRes.status}`);
const css = await cssRes.text();
const fontUrl = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1];
if (!fontUrl) throw new Error(`No woff2 URL in Google Fonts response:\n${css}`);

const fontRes = await fetch(fontUrl, { headers: { 'User-Agent': UA } });
if (!fontRes.ok) throw new Error(`Font download failed: ${fontRes.status}`);
const buf = Buffer.from(await fontRes.arrayBuffer());
await writeFile(outFile, buf);

console.log(`${sorted.length} icons → ${path.relative(root, outFile)} (${buf.length} bytes)`);
