// Walks src/ and scans every non-test .ts/.tsx file (Node only: used by the
// copy-guard test and the baseline CLI, never bundled into the app).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { scanSource, type Scan } from './copy-scan';

const SKIP_DIR = new Set(['node_modules', '.next', 'ci']);

export function scanRepo(root: string): Record<string, Scan> {
  const out: Record<string, Scan> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIR.has(name)) walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name) || name.endsWith('.d.ts')) continue;
      const rel = relative(root, full).split(sep).join('/');
      const scan = scanSource(rel, readFileSync(full, 'utf8'));
      if (scan.copy || scan.ternary) out[rel] = scan;
    }
  };
  walk(join(root, 'src'));
  return out;
}
