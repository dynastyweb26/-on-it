// Simulation harness for popup components: a real DOM (jsdom) and real React
// rendering, driven by synthetic taps, so the state matrix (idle, pending,
// error, repeat-tap) runs in `npm test` with nobody tapping a preview.
// Not a test file itself. Import `setup()` first, then `mount()`.
import { JSDOM } from 'jsdom';
import type { ReactElement } from 'react';

type G = Record<string, unknown>;

let ready = false;
export function setup(): void {
  if (ready) return;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const g = globalThis as unknown as G;
  const w = dom.window as unknown as G;
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent',
    'PointerEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    Object.defineProperty(globalThis, key, { value: w[key], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'sim', clipboard: undefined }, configurable: true, writable: true });
  // React feature-detects `oninput` on document; jsdom omits it, which sends
  // React down its IE code path (attachEvent) on any focused input.
  Object.defineProperty(dom.window.document, 'oninput', { value: null, configurable: true });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  (dom.window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ready = true;
}

export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export async function mount(element: ReactElement) {
  setup();
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    async rerender(next: ReactElement) { await act(async () => { root.render(next); }); },
    async unmount() { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

export async function act(fn: () => unknown): Promise<void> {
  const { act: reactAct } = await import('react');
  await reactAct(async () => { await fn(); });
}

/** All queries read document.body, because sheets render in a portal. */
export const q = {
  button: (label: string | RegExp): HTMLButtonElement | null =>
    [...document.body.querySelectorAll('button')].find((b) =>
      typeof label === 'string' ? b.textContent?.trim() === label : label.test(b.textContent ?? '')) as HTMLButtonElement | null ?? null,
  byLabel: (aria: string): HTMLElement | null => document.body.querySelector(`[aria-label="${aria}"]`),
  text: (): string => document.body.textContent ?? '',
  alert: (): HTMLElement | null => document.body.querySelector('[role="alert"]'),
  dialog: (): HTMLElement | null => document.body.querySelector('[role="dialog"],[role="alertdialog"]'),
};

export function click(el: Element | null): void {
  if (!el) throw new Error('click: element not found');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** A tap, flushed through React like a real one. */
export async function tap(el: Element | null): Promise<void> {
  await act(() => click(el));
}

/** Rage-tap: n clicks in the same frame, before React can re-render. */
export async function rageTap(el: Element | null, n = 3): Promise<void> {
  await act(() => { for (let i = 0; i < n; i += 1) click(el); });
}

export async function pressEscape(): Promise<void> {
  await act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
}

/** Let microtasks and zero-delay timers settle. */
export async function settle(): Promise<void> {
  await act(() => new Promise((r) => setTimeout(r, 0)));
}

/** Flush resolved promises without any timer (safe under mocked timers). */
export async function flush(): Promise<void> {
  await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
}

/** Remove everything a test mounted. */
export function reset(): void {
  document.body.innerHTML = '';
}

// Importing this module installs the DOM, so it must be imported before any
// component (react-dom reads `window` when it first loads).
setup();
