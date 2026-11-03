// ═══ Builder → card shared-node travel ═══
// docs/design/onit-chat · Prototype.dc.html, builderSend(): clone each shared
// node into a fixed overlay and carry it from its OLD rect to the card's NEW
// rect with transform + opacity only. The card's real node stays hidden until
// the clone lands, so the words appear at their final size and place instead of
// jumping there.
//
// Why not Framer's layoutId: the chat card loads the domAnimation feature set
// (components/chat/LedgerMotion.tsx), which has no layout projection, so the
// layoutId pairs never travelled — the builder faded and the card simply
// appeared. This is dependency-free, touches no React state, and reads the
// geometry at call time.
//
// Reduced motion: no clones at all. The caller's existing crossfade (the
// builder's own ghost) is the whole transition.

const DURATION_MS = 600;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Carry every `[data-shared]` node from `from` (the builder) to its match in
 * `to` (the card). Returns a cleanup that removes the clones and restores the
 * hidden nodes, so an unmount mid-flight leaves nothing behind.
 */
export function morphSharedNodes(from: Element | null, to: Element | null): () => void {
  if (!from || !to || prefersReducedMotion()) return () => {};

  const old = new Map<string, DOMRect>();
  from.querySelectorAll<HTMLElement>('[data-shared]').forEach((el) => {
    const key = el.getAttribute('data-shared');
    if (!key || old.has(key)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height) old.set(key, rect);
  });
  if (!old.size) return () => {};

  const clones: HTMLElement[] = [];
  const hidden: HTMLElement[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0;
  let cancelled = false;

  // Let the card's own first paint settle (its anchor can shift the list by a
  // frame), then measure once and start every node together.
  raf = requestAnimationFrame(() => {
    if (cancelled) return;
    old.forEach((oldRect, key) => {
      const target = to.querySelector<HTMLElement>(`[data-shared="${key}"]`);
      if (!target) return;
      const next = target.getBoundingClientRect();
      if (!next.width || !next.height) return;

      const clone = target.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-shared');
      const cs = getComputedStyle(target);
      const scale = next.height ? oldRect.height / next.height : 1;

      Object.assign(clone.style, {
        position: 'fixed',
        left: `${next.left}px`,
        top: `${next.top}px`,
        width: `${next.width}px`,
        margin: '0',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: cs.color,
        letterSpacing: cs.letterSpacing,
        textAlign: cs.textAlign,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transformOrigin: '0 0',
        pointerEvents: 'none',
        zIndex: '70',
        opacity: '0',
        willChange: 'transform, opacity',
        transform: `translate(${oldRect.left - next.left}px, ${oldRect.top - next.top}px) scale(${scale})`,
      });
      document.body.appendChild(clone);
      clones.push(clone);

      target.style.visibility = 'hidden';
      hidden.push(target);

      // Two frames: one for the clone's start style to land, one to start the
      // transition (a single frame collapses both into no animation).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          clone.style.transition = `transform ${DURATION_MS}ms ${EASE}, opacity 280ms ${EASE}`;
          clone.style.transform = 'none';
          clone.style.opacity = '1';
        });
      });

      timers.push(setTimeout(() => {
        target.style.visibility = '';
        clone.remove();
      }, DURATION_MS + 60));
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    clones.forEach((c) => c.remove());
    hidden.forEach((el) => { el.style.visibility = ''; });
  };
}
