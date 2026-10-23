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
  // Next ships no "exports" map, so Node needs the extension on its subpaths.
  if (specifier === 'next/server') return next('next/server.js', context);
  let file = null;
  if (specifier.startsWith('@/')) file = withExtension(path.join(SRC, specifier.slice(2)));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    file = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }
  return file ? next(pathToFileURL(file).href, context) : next(specifier, context);
}

// .tsx: Node's type stripping doesn't do JSX, so transpile with the project's
// own TypeScript (react-jsx runtime). Lets a test render a component to a
// string with react-dom/server (e.g. the PDF templates in
// src/lib/pdf/templates/bank-line.test.ts). Only for files under src/.
let ts;
export async function load(url, context, next) {
  if (url.endsWith('.tsx') && url.startsWith('file:') && fileURLToPath(url).startsWith(SRC)) {
    ts ??= (await import('typescript')).default;
    const { readFileSync } = await import('node:fs');
    const out = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        verbatimModuleSyntax: false,
      },
      fileName: fileURLToPath(url),
    });
    return { format: 'module', source: out.outputText, shortCircuit: true };
  }
  return next(url, context);
}
