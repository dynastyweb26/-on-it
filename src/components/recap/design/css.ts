// The redesign's slides are ported from design/recaps/RecapPlayer.dc.html with
// every inline style kept as the design's own string (RULES 5, WORK-SPLIT 5).
// s() turns one such string into a React style object, once per string. The
// only edits are the three font families, which map to the app's own fonts.
import type { CSSProperties } from 'react';

const cache = new Map<string, CSSProperties>();

export function s(css: string): CSSProperties {
  const hit = cache.get(css);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const value = decl.slice(i + 1).trim()
      .replace(/Montserrat,\s*system-ui,\s*sans-serif/g, 'var(--onit-display)')
      .replace(/Inter,\s*system-ui,\s*sans-serif/g, 'var(--onit-body)')
      .replace(/'Material Symbols Outlined'/g, 'var(--font-symbols)');
    const key = prop.startsWith('--') ? prop : prop.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = value;
  }
  cache.set(css, out as CSSProperties);
  return out as CSSProperties;
}

/** A Material Symbols glyph at the design's size: `font:400 Npx/1 …` in a clipped N px box. */
export const iconStyle = (px: number, extra = '') =>
  s(`font:400 ${px}px/1 'Material Symbols Outlined';width:${px}px;height:${px}px;overflow:hidden;display:block;white-space:nowrap;${extra}`);
