'use client';
// ═══ Ledger card (docs/design/onit-chat · CardLedger.dc.html) ═══
// The chat document card's VISUALS only: the warm-white printed sheet, its
// state strip (DRAFT / SENT — LOCKED / READY TO SHARE), the client block, the
// charcoal total block and the one-line sent summary. Every control inside the
// card — line items, attachments, deposit, tax, notes, send, download, revise,
// Copy link / Share — stays in ChatView and keeps its handler. This file owns
// classes and layout, never behaviour.
//
// Design source: CardLedger.dc.html (sheet #FFFDF8, radius 18, strip 40px,
// client Montserrat 24, total Montserrat 38/800 on #2F2A24). Colours resolve to
// the app's tokens: gold = primary-container, ink = inverse-surface, sheet =
// surface-sheet, so a theme change carries through instead of pinning hexes.
import { useEffect, useState, type ReactNode } from 'react';
import { m } from 'framer-motion';
import Icon from '@/components/Icon';
import LedgerMotionProvider from '@/components/chat/LedgerMotion';
import { fetchUsageSnapshot } from '@/lib/usage';

export type LedgerState = 'draft' | 'sent' | 'ready';

/** The 40px state strip at the top of the sheet. One state is visible; item 6
 *  layers the three so a send can cross-fade between them. */
export function LedgerStateStrip({
  state,
  label,
  anim,
}: {
  state: LedgerState;
  /** Override the visible label (a paid/void row keeps its own wording). */
  label?: string;
  /** Plays the lock pill's arrival (sent / ready only). */
  anim?: boolean;
}) {
  const skin =
    state === 'draft'
      ? 'bg-primary-soft/70 text-primary border-b-[1.5px] border-dashed border-primary-container/60'
      : state === 'sent'
        ? 'bg-inverse-surface text-inverse-on-surface'
        : 'bg-primary-container text-on-background';
  return (
    <div
      data-ledger-strip={state}
      className={`flex h-10 items-center gap-1.5 px-4 text-caps uppercase ${skin}${
        anim ? ' onit-pill-in' : ''
      }`}
    >
      <Icon
        name={state === 'draft' ? 'edit' : 'lock'}
        size={16}
        filled={state !== 'draft'}
        className={
          state === 'draft'
            ? 'text-primary'
            : state === 'sent'
              ? 'onit-lock-drop text-primary-container'
              : 'onit-lock-drop text-on-background'
        }
      />
      <span className="truncate">
        {label ?? (state === 'draft' ? 'Draft · not sent' : state === 'sent' ? 'Sent — locked' : 'Ready to share')}
      </span>
    </div>
  );
}

/** The sheet. `children` is everything below the client name — the same controls
 *  the card had before, in the same order. */
export function LedgerFrame({
  state,
  kind,
  clientName,
  pillLabel,
  anim,
  children,
}: {
  state: LedgerState;
  kind: 'invoice' | 'quote';
  clientName: string | null | undefined;
  pillLabel?: string;
  anim?: 'enter' | 'lock' | 'exit' | null;
  children: ReactNode;
}) {
  return (
    <LedgerMotionProvider>
    <div
      data-ledger-card=""
      className={`relative overflow-hidden rounded-ledger border border-outline-variant/70 bg-surface-sheet shadow-ledger${
        anim === 'enter' ? ' onit-card-enter' : anim === 'exit' ? ' onit-card-exit' : ''
      }`}
    >
      {/* One gold sweep, once, on the server-confirmed seal. Never blocks taps. */}
      {anim === 'lock' && <span aria-hidden className="onit-gold-sweep" />}
      <LedgerStateStrip state={state} label={pillLabel} anim={anim === 'lock'} />
      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-1.5 text-caps text-on-surface-variant">
          <Icon name={kind === 'quote' ? 'request_quote' : 'description'} size={17} />
          {/* Keyed: a toggle replays the 8px lift + fade (design 2). */}
          <span key={kind} className="onit-label-in">{kind === 'quote' ? 'Estimate for' : 'Invoice for'}</span>
        </div>
        {/* Shared-element anchor for the builder morph (item 3). */}
        <m.div
          data-shared="client"
          layoutId="ledger-client"
          className="mt-1.5 font-display text-[24px] font-bold leading-tight tracking-tight text-on-background"
        >
          {clientName?.trim() || 'Client'}
        </m.div>
        <div className="mt-3 border-t border-outline-variant/40">{children}</div>
      </div>
    </div>
    </LedgerMotionProvider>
  );
}

/** The charcoal total block: caps label (and optional lines above) plus the
 *  amount. The amount is passed as a node so CountUpMoney still owns it. */
export function LedgerTotals({
  label,
  sublines,
  children,
}: {
  label: string;
  sublines?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-3.5 flex items-end justify-between gap-3 rounded-[14px] bg-inverse-surface px-4 py-4">
      <div className="min-w-0 pb-0.5">
        <div className="text-caps uppercase text-inverse-on-surface/70">
          <span key={label} className="onit-label-in">{label}</span>
        </div>
        {sublines}
      </div>
      <span
        data-shared="total"
        className="min-w-0 shrink-0 text-right"
      >
        <m.span
          layoutId="ledger-total"
          className="block font-display text-[38px] font-extrabold leading-none tracking-[-0.02em] text-inverse-on-surface tabular-nums"
        >
          {children}
        </m.span>
      </span>
    </div>
  );
}

/** The free-tier counter: one segment per allowed invoice, filled to the real
 *  count (/api/access), plus the existing text line. Paid tiers report no
 *  limit, so they get the text only — never an invented bar. Purely visual:
 *  the count comes from the server and nothing here can change it. */
export function LedgerUsageMeter({ text }: { text: string }) {
  const [snap, setSnap] = useState<{ invoiceCount?: number; invoiceLimit?: number | null } | null>(null);
  useEffect(() => {
    let live = true;
    void fetchUsageSnapshot().then((s) => { if (live) setSnap(s); });
    return () => { live = false; };
  }, [text]);

  const used = typeof snap?.invoiceCount === 'number' ? snap.invoiceCount : null;
  const limit = typeof snap?.invoiceLimit === 'number' ? snap.invoiceLimit : null;
  const segments = used !== null && limit !== null && limit > 0 ? Math.min(limit, 12) : 0;

  return (
    <div className="mt-2 px-1">
      {segments > 0 && (
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: segments }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < (used ?? 0) ? 'onit-seg-fill bg-primary-container' : 'bg-surface-container-high'}`}
              style={i < (used ?? 0) ? { animationDelay: `${120 + i * 80}ms` } : undefined}
            />
          ))}
        </div>
      )}
      <p className="mt-1 text-sm text-on-surface-variant">{text}</p>
    </div>
  );
}

/** The compact row that appears after an invoice goes out: client, document
 *  number · due, amount and SENT, with the ink spine the design uses. */
export function SentLedgerRow({
  clientName,
  invoiceNo,
  dueDate,
  amount,
}: {
  clientName: string;
  invoiceNo: string;
  dueDate: string;
  amount: string;
}) {
  return (
    <div className="flex w-full max-w-[82%] items-stretch overflow-hidden rounded-[16px] border border-outline-variant/70 bg-surface-sheet shadow-ledger">
      <span aria-hidden className="w-1.5 shrink-0 bg-inverse-surface" />
      <div className="min-w-0 flex-1 px-3.5 py-3">
        <p className="truncate font-display text-[17px] font-bold leading-tight text-on-background">{clientName}</p>
        <p className="mt-1 truncate font-mono text-meta text-on-surface-variant">
          {invoiceNo} · Due {dueDate}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 pr-3.5">
        <span className="font-display text-[18px] font-extrabold leading-none text-on-background tabular-nums">{amount}</span>
        <span className="inline-flex items-center gap-1 text-caps uppercase text-on-background">
          <Icon name="lock" size={13} filled /> SENT
        </span>
      </div>
    </div>
  );
}
