'use client';
// The save prompt (UI-REDESIGN-AUDIT §1.5, frames 2a / 2b; merge 2 · 2·13): a
// dark card floating just above the composer, no scrim, so typing, + and the
// camera keep working. It rises 14 px on a spring; Not now sinks it 10 px.
// Save runs the caller's save, then M2: the icon disc arcs into the Clients
// tab (which bumps and shows +1) while the card leaves. A failed save keeps
// the card open with a retry line. Reduce Motion: no flight, the tab still
// shows +1 (the global rule lands every animation on its end state).
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { money } from '@/lib/financials';
import type { SavePrompt } from '@/lib/save-prompts';

const OUT_MS = 160; // --motion-fast
const FLIGHT_MS = 700;

/** M2: fly a copy of `from` along an arc onto the tab, then bump the tab. */
function flyToTab(from: HTMLElement, href: string) {
  const bump = () => window.dispatchEvent(new CustomEvent('onit-tab-bump', { detail: { href } }));
  const target = document.querySelector<HTMLElement>(`[data-tab-target="${href}"]`);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!target || reduce || typeof from.animate !== 'function') { bump(); return; }
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: '0', zIndex: '80', pointerEvents: 'none',
  });
  ghost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ghost);
  // A quadratic arc: up first, then down onto the tab's centre.
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const cx = dx * 0.35;
  const cy = Math.min(dy, 0) - 90;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = 2 * (1 - t) * t * cx + t * t * dx;
    const y = 2 * (1 - t) * t * cy + t * t * dy;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 - 0.45 * t})`, opacity: t > 0.9 ? 0.6 : 1 });
  }
  const anim = ghost.animate(frames, { duration: FLIGHT_MS, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  const done = () => { ghost.remove(); bump(); };
  anim.onfinish = done;
  anim.oncancel = done;
}

export default function SavePromptCard({ prompt, onSave, onDone }: {
  prompt: SavePrompt;
  /** Resolves true once saved. */
  onSave: () => Promise<boolean>;
  /** The card has left (saved or Not now): show the next prompt. */
  onDone: () => void;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'out'>('idle');
  const disc = useRef<HTMLSpanElement>(null);

  const leave = () => { setState('out'); setTimeout(onDone, OUT_MS); };
  async function save() {
    if (state === 'saving' || state === 'out') return;
    setState('saving');
    const ok = await onSave().catch(() => false);
    if (!ok) { setState('error'); return; }
    if (disc.current) flyToTab(disc.current, '/clients');
    leave();
  }

  const client = prompt.kind === 'client';
  return (
    <div role="region" aria-label={client ? 'Save client' : 'Save product or service'} aria-live="polite"
      className={`${state === 'out' ? 'onit-prompt-out' : 'onit-prompt-in'} rounded-[18px] bg-[#2E2822] px-3.5 pb-3 pt-3.5 text-[#FCF7EF] shadow-[0_14px_32px_rgba(34,30,24,.28)]`}>
      <div className="flex items-start gap-3">
        <span ref={disc} className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary-container text-on-background">
          <Icon name={client ? 'person_add' : 'sell'} size={19} />
        </span>
        <p className="min-w-0 pt-1.5 text-[15px] leading-snug">
          Save <b className="font-bold">{prompt.name}</b>
          {prompt.kind === 'product' && prompt.price != null ? ` (${money(prompt.price)})` : ''}
          {client ? ' to your clients?' : ' to your products & services?'}
        </p>
      </div>
      {state === 'error' && <p className="mt-2 pl-[46px] text-[13.5px] text-[#F3B8A8]">Couldn’t save. Try again.</p>}
      <div className="mt-2.5 flex justify-end gap-2">
        <button type="button" onClick={leave} disabled={state === 'saving' || state === 'out'}
          className="h-10 rounded-full border border-[#FCF7EF]/30 px-4 text-[14.5px] font-bold active:scale-95">
          Not now
        </button>
        <button type="button" onClick={() => { void save(); }} aria-busy={state === 'saving' || undefined}
          disabled={state === 'saving' || state === 'out'}
          className="h-10 rounded-full bg-primary-container px-5 text-[14.5px] font-bold text-on-background active:scale-95 disabled:opacity-80">
          Save
        </button>
      </div>
    </div>
  );
}
