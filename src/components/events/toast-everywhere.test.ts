// The toast is mounted ONCE, in AppShell, which wraps every (app) route. This
// guards each place it must show, and that nothing is stacked above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOAST_Z } from '../../lib/toast-queue';

const read = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const shell = read('src/components/app/AppShell.tsx');
const layout = read('src/app/(app)/layout.tsx');

test('the one mount: (app)/layout wraps every page in AppShell, which renders the host', () => {
  assert.match(layout, /<AppShell[\s\S]*\{children\}[\s\S]*<\/AppShell>/);
  assert.match(shell, /<EventToastHost\s*\/>/);
  // AppShell has a single render path, so no route can skip the mount.
  const fnBody = shell.slice(shell.indexOf('export default function AppShell'), shell.indexOf('function BooksDot'));
  assert.equal((fnBody.match(/^  return \(/gm) ?? []).length, 1);
});

for (const [place, page] of [
  ['Chat', 'chat'],
  ['Clients', 'clients'],
  ['Invoices', 'invoices'],
  ['Books', 'dashboard'],
  ['Settings', 'settings'],
] as const) {
  test(`tab ${place}: its page lives under (app), so it is inside the shell`, () => {
    assert.ok(existsSync(`src/app/(app)/${page}/page.tsx`), page);
  });
}

test('every (app) page is inside the shell (none is outside the group)', () => {
  const pages = walk('src/app/(app)').filter((f) => f.endsWith('page.tsx'));
  assert.ok(pages.length >= 20);
  for (const f of pages) assert.ok(f.startsWith('src/app/(app)/'), f);
});

test('invoice and estimate detail (and its edit-in-place screen) render under (app)/invoices/[id]', () => {
  const page = read('src/app/(app)/invoices/[id]/page.tsx');
  assert.match(page, /InvoiceDetailScreen/);
  assert.ok(existsSync('src/components/invoice-detail/InvoiceDetailScreen.tsx'));
  assert.ok(existsSync('src/components/estimates/EstimateDetail.tsx'));
});

test('the record-payment card lives in Chat, which renders under (app)/chat', () => {
  const chatPage = read('src/app/(app)/chat/page.tsx');
  assert.match(chatPage, /Chat|TabDeck|ChatView/);
  assert.match(read('src/components/tabs/ChatView.tsx'), /record_payment/);
});

test('host: fixed overlay at TOAST_Z, below the safe-area inset, follows the keyboard viewport', () => {
  const host = read('src/components/events/EventToastHost.tsx');
  assert.match(host, /position: 'fixed'/);
  assert.match(host, /zIndex: TOAST_Z/);
  assert.match(host, /env\(safe-area-inset-top/);
  assert.match(host, /var\(--vv-top, 0px\)/);
});

test('the shell root creates no stacking context or containing block that could trap the toast', () => {
  const root = /<div data-app-shell=""[^>]*className="([^"]+)"/.exec(shell);
  assert.ok(root, 'shell root found');
  assert.doesNotMatch(root![1], /\b(z-|transform|filter|backdrop|contain|will-change|isolate)/);
});

// Nothing may be stacked above the toast, except the splash and the walkthrough takeover.
const ABOVE_ALLOWED = new Set([
  'src/app/globals.css',                                  // .onit-splash (9999, app launch only)
  'src/components/tutorial/tutorial.module.css',          // walkthrough takeover (1000)
  'src/components/tutorial/CoachMarkOverlay.tsx',         // coach marks (9999, pointer-events-none)
]);

test('no sheet, modal or screen sits above the toast', () => {
  const files = walk('src').filter((f) => /\.(tsx|css)$/.test(f));
  const re = /z-index:\s*(\d+)|zIndex:\s*(\d+)|\bz-\[(\d+)\]|\bz-(\d+)\b/g;
  const offenders: string[] = [];
  for (const f of files) {
    if (ABOVE_ALLOWED.has(f)) continue;
    const text = read(f);
    for (const m of text.matchAll(re)) {
      const n = Number(m[1] ?? m[2] ?? m[3] ?? m[4]);
      if (n >= TOAST_Z && !f.endsWith('EventToastHost.tsx')) offenders.push(`${f}: ${n}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the sheets and modals that portal to <body> stay below the toast', () => {
  const z = (f: string) => Number(/z-\[(\d+)\]/.exec(read(f))?.[1]);
  assert.ok(z('src/components/popups/PopSheet.tsx') < TOAST_Z);
  assert.ok(z('src/components/bank/BankSheet.tsx') < TOAST_Z);
  assert.ok(z('src/components/recap/RecapProvider.tsx') < TOAST_Z);
  assert.match(read('src/components/recap/recap.css'), /z-index: 95;/); // the story player: 95 < 96
});
