'use client';
// Slide 09, Free plan (RecapPlayer.dc.html "09 FREE PLAN"). In the sequence only
// for a free-plan row that owns one of the two free recaps; freeRecapNumber
// (1 or 2) is which one. The bank bullet is the design's own copy.
import { useRef } from 'react';
import type { SlideProps } from '@/components/recap/clock';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';

const BULLET = 'display:flex;align-items:center;gap:12px;font:600 15px/20px Inter,system-ui,sans-serif';
const BODY = 'font:400 17px/25px Inter,system-ui,sans-serif;color:#4d4635;text-wrap:pretty';

export default function DesignFree({ payload: p, clock, reduced, onAction }: SlideProps) {
  const sent = useRef(false);
  const used = Math.min(2, Math.max(1, p.freeRecapNumber ?? 2));
  const pips = [1, 2].map((i) => ({ i, d: 200 + i * 180, on: i <= used }));
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="free" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Free plan</div>
          <div style={s('margin-top:44px;display:flex;gap:10px')}>
            {pips.map((x) => (
              <span key={x.i} data-a="pop" data-d={x.d}
                style={s(`width:44px;height:44px;border-radius:999px;display:grid;place-items:center;background:${x.on ? 'linear-gradient(180deg,#f1d57c,#d4af37)' : '#efe6d6'};color:${x.on ? '#1f1b13' : '#7f7663'}`)}>
                <span style={iconStyle(24)}>{x.on ? 'check' : 'remove'}</span>
              </span>
            ))}
          </div>
          <h2 data-a="up" data-d="700" style={s('margin:26px 0 0;font:800 34px/40px Montserrat,system-ui,sans-serif;letter-spacing:-.015em;text-wrap:balance')}>
            This was your <span data-f="free_recap_ordinal">{used === 1 ? '1st' : '2nd'}</span> free recap.
          </h2>
          <p data-a="up" data-d="950" data-f="free_recaps_left" style={s(`margin:14px 0 0;${BODY}`)}>
            {used >= 2 ? 'The free plan includes 2 weekly recaps, and this was the last one.' : 'The free plan includes 2 weekly recaps, so you have 1 more coming.'}
          </p>
          <p data-a="up" data-d="1150" style={s(`margin:12px 0 0;${BODY}`)}>After that, recaps are part of On It Pro, $15 a month. Your invoices and your books stay exactly as they are.</p>
          <div style={s('margin-top:26px;display:flex;flex-direction:column;gap:12px')}>
            <div data-a="left" data-d="1500" style={s(BULLET)}><span style={iconStyle(22, 'color:#735c00')}>auto_stories</span>A recap every week and every month</div>
            <div data-a="left" data-d="1650" style={s(BULLET)}><span style={iconStyle(22, 'color:#735c00')}>account_balance</span>Bank activity picked up automatically</div>
          </div>
          <div style={s('flex:1 1 0')} />
          <button type="button" data-a="up" data-d="2000" data-act="1"
            onClick={(e) => { e.stopPropagation(); if (sent.current) return; sent.current = true; onAction('upgrade'); }}
            style={s('width:100%;height:52px;border:0;border-radius:999px;background:#f0e3b8;color:#1f1b13;font:700 16px/1 Montserrat,system-ui,sans-serif;cursor:pointer')}>See On It Pro</button>
          <div data-a="fade" data-d="2300" data-dur="300" style={s('margin-top:14px;text-align:center;font:400 13px/18px Inter,system-ui,sans-serif;color:#4d4635')}>No rush. Tap to keep going.</div>
        </div>
      </div>
    </Stage>
  );
}
