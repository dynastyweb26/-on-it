import type { Page } from '@playwright/test';

/** The retired word. On screen it is "estimate"; `quote` is only a stored value. */
export const FORBIDDEN = /\b(?:quotes?|quoted)\b/i;

/** Everything a person or a screen reader can get from the page. */
export async function visibleCopy(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const text = document.body.innerText;
    out.push(...text.split('\n').map((s) => s.trim()).filter(Boolean));
    for (const el of Array.from(document.querySelectorAll('[aria-label],[title],[placeholder],[alt]'))) {
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
    }
    return out;
  });
}

/** Uncaught page errors and console.error, minus noise from failed asset loads. */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/i.test(t)) return;
    // Vercel's preview toolbar is injected on previews only and our CSP blocks it.
    if (/vercel\.live/i.test(t)) return;
    problems.push(`console.error: ${t.slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(page.url() || r.url()).origin && r.status() >= 500) {
      problems.push(`HTTP ${r.status()}: ${u.pathname}`);
    }
  });
  return problems;
}
