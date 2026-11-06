// Interaction rule 4 (CLAUDE.md): anything that appears below the fold scrolls
// into view. The containers in this app scroll themselves — a card body, a
// sheet's list — so the reveal asks for the NEAREST edge: 'nearest' moves that
// one scroller as far as the new section needs and never jumps the page.
//
// JS-driven scrolling has to honour Reduce Motion itself; the CSS kill switch
// in globals.css only reaches CSS motion, so a glide becomes an instant jump.
import { reducedMotion } from './list-motion';

/** Scroll `el` just far enough to be fully visible. Returns whether it ran. */
export function revealSection(el: Element | null, reduced: boolean = reducedMotion()): boolean {
  if (!el) return false;
  el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  return true;
}
