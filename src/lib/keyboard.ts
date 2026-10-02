// App-wide on-screen keyboard handling (mounted once by
// components/KeyboardAvoider.tsx in the root layout, so it covers every text
// field in the app, including ones added later).
//
// The problem: on iPhone the keyboard overlays the page without resizing it —
// the layout viewport (window.innerHeight, h-dvh, `fixed inset-0`) stays full
// height and only window.visualViewport shrinks — so a field near the bottom
// (the paywall code field, the chat composer, a sheet's last input) ends up
// under the keyboard with nothing left to scroll. Android with
// interactive-widget=resizes-content (app/layout.tsx) shrinks the layout
// viewport instead, which fixes the height but still leaves pinned footers
// eating the space that's left.
//
// What this does, driven by visualViewport:
//  - Publishes the keyboard on <html>: `data-kb` while it's open, plus
//    --kb (keyboard height), --kb-overlap (how far it covers the bottom of the
//    layout viewport, i.e. of a `fixed bottom-*` element), --vvh / --vv-top
//    (the visible area). globals.css uses these to:
//      [data-kb-hide]   pinned footers/nav: hidden while the keyboard is open
//      [data-kb-lift]   fixed bottom elements (toasts): lifted above it
//      [data-kb-fit]    full-screen layers (app shell, paywall, sheets): pinned
//                       to the visible area, so their bottom edge sits right
//                       on top of the keyboard
//  - Keeps the focused field directly above the keyboard: adds bottom padding
//    to its scroll container equal to whatever the keyboard still covers, then
//    scrolls the container (instantly — iOS drops taps during a smooth scroll)
//    so the field clears the keyboard by MARGIN px.
//  - Restores everything (padding, attribute) on blur or when the keyboard
//    closes without a blur (Android back button).
// It only re-scrolls on focus and on viewport RESIZE, never on viewport scroll,
// so it never fights the user scrolling the page while typing.

const MARGIN = 12; // gap kept between the focused field and the keyboard
// The visible height must drop by this much before we call it a keyboard:
// larger than iOS's collapsing URL bar / QuickType row, smaller than any
// keyboard.
const OPEN_THRESHOLD = 120;

const NON_TEXT_TYPES = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
]);

/** True for elements that bring up the on-screen keyboard. */
export function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NON_TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return el.isContentEditable;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
    p = p.parentElement;
  }
  return null; // the document itself
}

// Pages outside the app shell (login, onboarding, reset-password) scroll the
// document; the shell locks it (overflow: hidden, globals.css). A short page
// that fits today still counts: the keyboard padding is what makes it scroll.
function documentScrolls(): boolean {
  return getComputedStyle(document.documentElement).overflowY !== 'hidden'
    && getComputedStyle(document.body).overflowY !== 'hidden';
}

export function startKeyboardAvoidance(): () => void {
  const vv = window.visualViewport;
  const html = document.documentElement;
  let focused: HTMLElement | null = null;
  let open = false;
  // Tallest visible height seen at this width: the "no keyboard" baseline.
  // Reset on a width change (rotation), where the old one no longer applies.
  let baseW = window.innerWidth;
  let baseH = vv ? Math.max(vv.height, window.innerHeight) : window.innerHeight;
  // The one scroll container we padded: its own inline padding (restored on
  // blur), its computed padding before ours, and what we added on top.
  let padded: { el: HTMLElement; prev: string; base: number; px: number } | null = null;
  let raf = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  function restorePadding() {
    if (!padded) return;
    padded.el.style.paddingBottom = padded.prev;
    padded = null;
  }

  function setPadding(el: HTMLElement, px: number) {
    if (padded && padded.el !== el) restorePadding();
    if (!padded) {
      padded = { el, prev: el.style.paddingBottom, base: parseFloat(getComputedStyle(el).paddingBottom) || 0, px: 0 };
    }
    // Only ever grows while a field is focused: shrinking it again mid-keyboard
    // would clamp scrollTop and make the content jump.
    if (px <= padded.px) return;
    padded.px = px;
    el.style.paddingBottom = `${Math.round(padded.base + px)}px`;
  }

  /** Scroll so `el` sits fully inside the visible area, MARGIN above the keyboard. */
  function ensureVisible(el: HTMLElement) {
    if (!el.isConnected) return;
    const visTop = vv ? vv.offsetTop : 0;
    const visBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const kb = Math.max(0, baseH - (vv ? vv.height : window.innerHeight));
    const sp = scrollParent(el);

    let top = visTop;
    let bottom = visBottom;
    if (sp) {
      const r = sp.getBoundingClientRect();
      // Room the keyboard covers inside this container: pad it so the last
      // field can scroll up past the keyboard.
      const covered = Math.ceil(r.bottom - visBottom);
      if (covered > 0) setPadding(sp, covered + MARGIN);
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    } else if (documentScrolls()) {
      if (kb > 0) setPadding(document.body, kb);
    } else {
      return; // nothing can scroll (a fitted layer): its layout already holds the field
    }

    const r = el.getBoundingClientRect();
    let delta = 0;
    if (r.bottom + MARGIN > bottom) delta = r.bottom + MARGIN - bottom;
    // A field taller than the space (a long textarea): keep its top in view.
    if (r.top - delta - MARGIN < top) delta = r.top - MARGIN - top;
    if (Math.abs(delta) < 1) return;
    if (sp) sp.scrollTop += delta;
    else window.scrollBy(0, delta);
  }

  function measure() {
    raf = 0;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = Math.max(h, window.innerHeight); }
    else if (!focused) baseH = Math.max(baseH, h, window.innerHeight);
    const kb = Math.max(0, Math.round(baseH - h));
    const overlap = Math.max(0, Math.round(window.innerHeight - top - h));
    const nowOpen = !!focused && kb > OPEN_THRESHOLD;

    html.style.setProperty('--vvh', `${Math.round(h)}px`);
    html.style.setProperty('--vv-top', `${Math.round(top)}px`);
    html.style.setProperty('--kb', `${nowOpen ? kb : 0}px`);
    html.style.setProperty('--kb-overlap', `${nowOpen ? overlap : 0}px`);
    return nowOpen;
  }

  function apply(rescroll: boolean) {
    const nowOpen = measure();
    if (nowOpen !== open) {
      open = nowOpen;
      if (open) html.setAttribute('data-kb', '');
      else { html.removeAttribute('data-kb'); restorePadding(); }
      rescroll = open;
    }
    // After the attribute's CSS (fitted shell, hidden footers) has laid out.
    if (open && rescroll && focused) {
      const el = focused;
      requestAnimationFrame(() => { if (focused === el) ensureVisible(el); });
    }
  }

  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => apply(true)); };
  // Viewport scroll (iOS panning, the user scrolling): track the visible area
  // for fitted layers, but never re-scroll the content.
  const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => apply(false)); };

  function onFocusIn(e: FocusEvent) {
    const t = e.target as Element | null;
    if (!isTextEntry(t)) return;
    if (padded && focused && scrollParent(t) !== padded.el) restorePadding();
    focused = t;
    apply(true);
    // The keyboard animates in; iOS sometimes fires a single resize before it
    // settles, so check again once it has.
    timers.push(setTimeout(() => { if (focused === t) apply(true); }, 350));
  }

  function onFocusOut() {
    // Focus moving field → field fires focusout then focusin: wait a tick so
    // the keyboard (and the padding) stay put between the two.
    timers.push(setTimeout(() => {
      if (isTextEntry(document.activeElement)) return;
      focused = null;
      apply(false);
      restorePadding();
    }, 0));
  }

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  vv?.addEventListener('resize', onResize);
  vv?.addEventListener('scroll', onScroll);
  window.addEventListener('resize', onResize);
  measure();
  // A field that already has focus at mount (autoFocus).
  if (isTextEntry(document.activeElement)) { focused = document.activeElement; apply(true); }

  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    vv?.removeEventListener('resize', onResize);
    vv?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    restorePadding();
    html.removeAttribute('data-kb');
    for (const v of ['--vvh', '--vv-top', '--kb', '--kb-overlap']) html.style.removeProperty(v);
  };
}
