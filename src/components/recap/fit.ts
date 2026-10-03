'use client';
// Layout helpers shared by the content slides (RECAP-SPEC §0b: "hero numbers
// auto-fit; names truncate"). Both run once, when a slide builds, before any
// animation is created, so measurements see the settled layout.

/** Shrinks a hero number's font so its FINAL text fits one line (it counts up
 *  from $0, so it's measured at its final value, then restored). */
export function fitText(el: HTMLElement | null, finalText: string) {
  if (!el) return;
  const prev = el.textContent;
  el.style.fontSize = '';
  el.textContent = finalText;
  const k = el.clientWidth / Math.max(1, el.scrollWidth);
  if (k < 1) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.floor(size * k)}px`;
  }
  el.textContent = prev;
}

/** The content column (`.rc-content`: label … spacer … card) pushes its card
 *  to the bottom with a spacer. On a short screen (an SE in Safari) the parts
 *  can need more height than there is; then the whole column scales down
 *  uniformly from the top so nothing overlaps or runs off. */
export function fitContent(box: HTMLElement | null) {
  if (!box) return;
  // Reset everything a previous pass set (effects can run twice in dev).
  box.style.transform = '';
  box.style.height = '';
  box.style.bottom = '';
  const avail = box.clientHeight;
  const need = Array.from(box.children).reduce((h, c) => {
    if ((c as HTMLElement).classList.contains('rc-spacer')) return h;
    const cs = getComputedStyle(c);
    return h + (c as HTMLElement).offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  }, 0) + 16; // the card keeps a little air above it
  if (need <= avail) return;
  const k = avail / need;
  box.style.height = `${need}px`;
  box.style.bottom = 'auto';
  box.style.transformOrigin = '50% 0';
  box.style.transform = `scale(${k.toFixed(4)})`;
}
