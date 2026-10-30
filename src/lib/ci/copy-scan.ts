// Finds user-facing uses of the retired word "quote" (it is "estimate" on
// screen; `quote` stays only as the stored invoices.kind value). Used by the
// copy-guard ratchet test and by `npm run copy:baseline`. Pure: no fs, no deps.
//
// This is a heuristic on purpose. It counts a hit when the word sits in
//   - a string/template literal that is prose (has whitespace) or is exactly
//     "Quote"/"Quotes" (capitalised = display text, lowercase = stored value),
//   - JSX text (>...<),
// and it ignores comments. A second counter flags `? 'quote' :` ternaries,
// the shape of "print the stored value to the screen".

export const FORBIDDEN = /\b(?:quotes?|quoted)\b/i;

export interface Scan {
  copy: number;
  ternary: number;
}

interface Lexed {
  code: string;      // source with comments blanked out
  literals: string[]; // contents of every string / template literal
}

export function lex(src: string): Lexed {
  let code = '';
  const literals: string[] = [];
  let i = 0;
  // Template literals can nest `${ ... }` code; track brace depth per template.
  const templateStack: number[] = [];
  let braceDepth = 0;

  const readString = (quote: string): void => {
    let s = '';
    i++; // opening quote
    while (i < src.length && src[i] !== quote && src[i] !== '\n') {
      if (src[i] === '\\') { s += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
      s += src[i++];
    }
    i++; // closing quote
    literals.push(s);
    code += quote + quote;
  };

  const readTemplate = (): void => {
    let s = '';
    i++; // opening backtick
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] ?? ''); i += 2; continue; }
      if (c === '`') { i++; literals.push(s); code += '``'; return; }
      if (c === '$' && src[i + 1] === '{') {
        literals.push(s); s = '';
        i += 2;
        templateStack.push(braceDepth);
        braceDepth++;
        code += '${';
        return; // resume as code; the closing } re-enters the template
      }
      s += c; i++;
    }
    literals.push(s);
  };

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"') { readString(c); continue; }
    if (c === '`') { readTemplate(); continue; }
    if (c === '{') braceDepth++;
    if (c === '}') {
      braceDepth--;
      if (templateStack.length && templateStack[templateStack.length - 1] === braceDepth) {
        templateStack.pop();
        code += '}';
        i++;
        readTemplateContinuation();
        continue;
      }
    }
    code += c; i++;
  }
  return { code, literals };

  // After a `${...}` closes, the template text continues until the next
  // backtick or the next `${`.
  function readTemplateContinuation(): void {
    let s = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] ?? ''); i += 2; continue; }
      if (c === '`') { i++; literals.push(s); return; }
      if (c === '$' && src[i + 1] === '{') {
        literals.push(s);
        i += 2;
        templateStack.push(braceDepth);
        braceDepth++;
        return;
      }
      s += c; i++;
    }
    literals.push(s);
  }
}

const isProse = (lit: string): boolean => /\s/.test(lit.trim()) || /^Quotes?$/.test(lit.trim());

export function scanSource(path: string, src: string): Scan {
  const { code, literals } = lex(src);
  let copy = 0;
  for (const lit of literals) {
    if (FORBIDDEN.test(lit) && isProse(lit)) copy++;
  }
  if (path.endsWith('.tsx')) {
    // JSX text node: text between a tag end and the next tag or expression.
    const jsx = />([^<>{}\n=][^<>{}\n]*)(?=[<{])/g;
    for (const m of code.matchAll(jsx)) {
      if (FORBIDDEN.test(m[1])) copy++;
    }
  }
  return { copy, ternary: countTernary(src) };
}

// Ternary check runs on the original text minus comments, because the lexer
// blanks literal contents (they become ''), which is exactly what we match on.
function countTernary(src: string): number {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return (noComments.match(/\?\s*(['"])quote\1\s*:/g) ?? []).length;
}

export interface Baseline {
  version: 1;
  copy: Record<string, number>;
  ternary: Record<string, number>;
}

/** Offenders: files whose count is above the baseline (a new file counts from 0). */
export function overBaseline(
  scans: Record<string, Scan>,
  baseline: Baseline,
): string[] {
  const problems: string[] = [];
  for (const [file, s] of Object.entries(scans)) {
    const allowedCopy = baseline.copy[file] ?? 0;
    const allowedTernary = baseline.ternary[file] ?? 0;
    if (s.copy > allowedCopy) {
      problems.push(`${file}: user-facing "quote" copy ${s.copy} > baseline ${allowedCopy}. Use docNoun()/"estimate".`);
    }
    if (s.ternary > allowedTernary) {
      problems.push(`${file}: "? 'quote' :" ternary ${s.ternary} > baseline ${allowedTernary}. Do not print the stored kind; map it with docNoun().`);
    }
  }
  return problems;
}

export function toBaseline(scans: Record<string, Scan>): Baseline {
  const copy: Record<string, number> = {};
  const ternary: Record<string, number> = {};
  for (const file of Object.keys(scans).sort()) {
    if (scans[file].copy) copy[file] = scans[file].copy;
    if (scans[file].ternary) ternary[file] = scans[file].ternary;
  }
  return { version: 1, copy, ternary };
}
