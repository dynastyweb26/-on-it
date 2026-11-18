'use client';
// Slide 08, Waiting for you (RecapPlayer.dc.html "08 WAITING FOR YOU"). Only in
// the sequence when the payload carries `bank` with rows still pending (RULE 7,
// the design's keys()). The newest three are listed, the rest as "+N more";
// Review opens the bank review sheet. Counts and names only: no money.
import { useRef } from 'react';
import type { SlideProps } from '@/components/recap/clock';
import { iconStyle, s } from '@/components/recap/design/css';
import Stage from '@/components/recap/design/Stage';
import { pendingLine, pendingMore, pendingRows } from '@/components/recap/design/bank-view';

export default function DesignWaiting({ payload: p, clock, reduced, onAction }: SlideProps) {
  const sent = useRef(false);
  const b = p.bank;
  if (!b || b.pending <= 0) return null;
  const rows = pendingRows(b.items, b.pending);
  return (
    <Stage clock={clock} reduced={reduced}>
      <div data-slide="waiting" style={s('position:absolute;inset:0')}>
        <div style={s('position:absolute;left:28px;right:28px;top:92px;bottom:36px;display:flex;flex-direction:column')}>
          <div data-a="up" data-d="0" style={s('font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#735c00')}>Waiting for you</div>
          <div data-a="count" data-v={b.pending} data-fmt="int" data-d="250" data-dur="1000" data-f="bank_pending_count"
            style={s('margin-top:20px;font:800 120px/118px Montserrat,system-ui,sans-serif;letter-spacing:-.04em;font-variant-numeric:tabular-nums')}>{b.pending}</div>
          <div data-a="up" data-d="600" style={s('margin-top:4px;font:700 24px/30px Montserrat,system-ui,sans-serif;text-wrap:balance')}>{pendingLine(b.pending)}</div>
          <div data-a="up" data-d="800" style={s('margin-top:10px;font:400 16px/23px Inter,system-ui,sans-serif;color:#4d4635;text-wrap:pretty')}>A quick look from you and they’re on the books.</div>
          <div style={s('margin-top:26px;display:flex;flex-direction:column;gap:8px')}>
            {rows.map((r, i) => (
              <div key={i} data-a="left" data-d={r.d}
                style={s('display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:16px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 12px 24px -20px rgba(31,27,19,.5)')}>
                <span style={s('width:32px;height:32px;border-radius:999px;background:#efe8dc;color:#4d4635;display:grid;place-items:center;flex:none')}>
                  <span style={iconStyle(18)}>account_balance</span>
                </span>
                <span data-f="pending_txn_name" style={s('flex:1;min-width:0;font:600 15px/20px Inter,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.name}</span>
                <span data-f="pending_txn_date" style={s('font:400 13px/18px Inter,system-ui,sans-serif;color:#4d4635')}>{r.date}</span>
              </div>
            ))}
            {pendingMore(b.pending) && (
              <div data-a="pop" data-d="2000" style={s('align-self:center;margin-top:4px;height:28px;padding:0 12px;border-radius:999px;background:#efe8dc;color:#4d4635;font:600 13px/1 Inter,system-ui,sans-serif;display:flex;align-items:center')}>
                {pendingMore(b.pending)}
              </div>
            )}
          </div>
          <div style={s('flex:1 1 0')} />
          <button type="button" data-a="up" data-d="2200" data-act="1"
            onClick={(e) => { e.stopPropagation(); if (sent.current) return; sent.current = true; onAction('review-bank'); }}
            className="rc-btn"
            style={s('width:100%;height:52px;border:0;border-radius:999px;background:linear-gradient(180deg,#dcb94a,#d4af37 50%,#c9a42c);color:#1f1b13;font:700 16px/1 Montserrat,system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 24px -10px rgba(212,175,55,.6),inset 0 1px 0 rgba(255,255,255,.35)')}>
            Review
          </button>
        </div>
      </div>
    </Stage>
  );
}
