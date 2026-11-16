'use client';
// Slide 10, Affirmation (RecapPlayer.dc.html "10 AFFIRMATION"), variant A only
// (RULES 1, 2): Montserrat text, no signature, "-by On It CEO" under Share.
// The line is pickAffirmation(userId, this owner's nth recap). Share draws the
// design's exportMode frame (360 x 640, no chrome, logo at the bottom) to a PNG
// and opens the share sheet. The PNG is drawn once the slide has settled, so the
// tap can open the sheet at once (a share sheet needs the tap's own moment).
import { useEffect, useRef, useState } from 'react';
import type { SlideProps } from '@/components/recap/clock';
import { pickAffirmation } from '@/lib/recap/ceo-affirmations';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';
import { fitText } from '@/components/recap/design/run';
import { renderShareImage, shareErrorMessage, shareImage } from '@/components/recap/design/share-image';

const WORDS = 'display:flex;flex-wrap:wrap;justify-content:center;gap:0 .26em;font:800 54px/60px Montserrat,system-ui,sans-serif;letter-spacing:-.025em';
const SWOOSH = 'position:absolute;left:0;right:0;top:42%;display:flex;justify-content:center;transform:translateY(-50%);pointer-events:none;opacity:.14';
const FRAME_BG = 'radial-gradient(110% 50% at 50% -4%,#fff,rgba(255,255,255,0) 64%),radial-gradient(120% 50% at 50% 110%,rgba(212,175,55,.10),rgba(212,175,55,0) 60%),#fff8f0';

export default function DesignAff({ payload: p, clock, reduced, userId = '' }: SlideProps) {
  const line = pickAffirmation(userId, p.recapIndex ?? 0);
  const words = line.split(' ');
  const exportRef = useRef<HTMLDivElement>(null);
  const image = useRef<Promise<Blob> | null>(null);
  const busy = useRef(false);   // synchronous: a second tap in the same frame is ignored
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState('');

  // Draw the export once the fonts are in; a failure here is retried on the tap.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const el = exportRef.current;
      if (!live || !el) return;
      fitText(el);
      image.current = renderShareImage(el);
      image.current.catch(() => { image.current = null; });
    }, 700);
    return () => { live = false; clearTimeout(t); };
  }, [line]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  async function onShare(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const el = exportRef.current;
      if (!el) throw new Error('the slide is not ready');
      if (!image.current) { fitText(el); image.current = renderShareImage(el); }
      const out = await shareImage(await image.current);
      if (out === 'saved') setToast('Image saved');
    } catch (err) {
      image.current = null;
      setToast(shareErrorMessage(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Stage clock={clock} reduced={reduced}>
        <div data-slide="aff" style={s('position:absolute;inset:0')}>
          <div style={s(SWOOSH)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-a="pop" data-d="100" data-dur="900" src="/recap/swoosh-gold.svg" alt="" draggable={false} style={s('display:block;width:340px;height:268px')} />
          </div>
          <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column;align-items:center;text-align:center')}>
            <div style={s('flex:1 1 0')} />
            <div data-f="affirmation_text" data-affit="54" data-lh="1.11" data-max="400" style={s(WORDS)}>
              {words.map((w, i) => <span key={i} data-a="up" data-d={550 + i * 90} data-dur="420">{w}</span>)}
            </div>
            <div data-a="gx" data-d="1700" data-dur="500" style={s('margin-top:24px;width:44px;height:3px;border-radius:999px;background:#d4af37;transform-origin:center')} />
            <div style={s('flex:1.6 1 0')} />
            <button type="button" data-a="up" data-d="2300" data-act="1" aria-busy={pending} onClick={onShare}
              style={{ ...s('width:100%;height:52px;border:0;border-radius:999px;background:linear-gradient(180deg,#dcb94a,#d4af37 50%,#c9a42c);color:#1f1b13;font:700 16px/1 Montserrat,system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 10px 24px -10px rgba(212,175,55,.6),inset 0 1px 0 rgba(255,255,255,.35)'), opacity: pending ? 0.7 : undefined }}>
              <span style={iconStyle(20)}>ios_share</span>{pending ? 'Preparing…' : 'Share'}
            </button>
            <div data-a="fade" data-d="2500" data-dur="300" style={s('margin-top:14px;font:400 13px/18px Inter,system-ui,sans-serif;color:#4d4635;white-space:nowrap')}>-by On It CEO</div>
          </div>
          {toast && (
            <div role="status" style={s('position:absolute;left:0;right:0;bottom:104px;display:flex;justify-content:center;z-index:25;pointer-events:none')}>
              <div style={s('padding:10px 16px;border-radius:999px;background:rgba(31,27,19,.86);color:#fff8f0;font:600 13px/1 Inter,system-ui,sans-serif')}>{toast}</div>
            </div>
          )}
        </div>
      </Stage>
      {/* The design's exportMode: the same slide at 360 x 640 with the logo and no chrome, kept off screen. */}
      <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <div ref={exportRef} style={{ ...s('position:relative;width:360px;height:640px;overflow:hidden;color:#1f1b13;font-family:Inter,system-ui,sans-serif'), background: FRAME_BG }}>
          <div style={s(SWOOSH)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/recap/swoosh-gold.svg" alt="" draggable={false} style={s('display:block;width:340px;height:268px')} />
          </div>
          <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column;align-items:center;text-align:center')}>
            <div style={s('flex:1 1 0')} />
            <div data-affit="54" data-lh="1.11" data-max="400" style={s(WORDS)}>
              {words.map((w, i) => <span key={i}>{w}</span>)}
            </div>
            <div style={s('margin-top:24px;width:44px;height:3px;border-radius:999px;background:#d4af37')} />
            <div style={s('flex:1.6 1 0')} />
            <div style={s('display:flex;align-items:center;gap:7px;font:800 13px/1 Montserrat,system-ui,sans-serif')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/apple-icon-180.png" alt="" style={s('width:22px;height:22px;border-radius:6px;display:block')} />On It
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
