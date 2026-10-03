// Resolve hook for scripts/test-register.mjs (see there).
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTS = ['.ts', '.tsx', '/index.ts'];

function withExtension(file) {
  if (existsSync(file) && statSync(file).isFile()) return file;
  for (const ext of EXTS) if (existsSync(file + ext)) return file + ext;
  return null;
}

export async function resolve(specifier, context, next) {
  let file = null;
  if (specifier.startsWith('@/')) file = withExtension(path.join(SRC, specifier.slice(2)));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    file = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }
  return file ? next(pathToFileURL(file).href, context) : next(specifier, context);
}
