'use client';

// The PDF + send block on the invoice screen (alive layer 04, "PDF + send
// actions"). It replaces the greyed "Preparing" buttons: Send never goes dead.
//   1 building  shimmer row "Building PDF…" + INV-0032.pdf, Send stays live
//   2 ready     file tile pops in (.6 -> 1.12 -> 1, 300ms), size, Preview
//   3 error     rust row "Couldn't build the PDF" + Retry; "Send link only"
//   4 sending   file row + gold button with a spinner, "Sending…"
//   5 sent      gold check "Sent to <name>" + Resend
// Spinner 18px / 2.5px / 800ms; shimmer 240px gold sweep, 1.4s.
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { countPdfPages, pdfMetaLine, type PdfSendPhase } from '@/lib/pdf/send-state';
import '@/components/alive/alive.css';

const inter = (css: string) => `${css} var(--font-inter), system-ui, sans-serif`;
const mono = { fontFamily: 'var(--font-plex-mono), ui-monospace, monospace' } as const;
const ROW = { display: 'flex', gap: 10, alignItems: 'center', height: 48, borderRadius: 14, background: '#fff', border: '1px solid var(--al-ctl-line)', padding: '0 12px' } as const;

export default function PdfSendCard({
  phase, fileName, file, queued, ready, onQueuedReady, clientFirst, sentLabel, resendLabel, errorSub, onSend, onRetry, onLinkOnly, onPreview,
}: {
  phase: PdfSendPhase;
  fileName: string;
  /** The built file: its page count and size make the "Ready" line. */
  file: File | null;
  /** A send tapped while the PDF was still building. */
  queued: boolean;
  /** The pre-build for the current render has settled. */
  ready: boolean;
  /** Fires once when a queued send's file is ready: the caller runs the one-tap share. */
  onQueuedReady: () => void;
  clientFirst: string | null;
  /** When it went out: "9:42 AM" or "Nov 7, 9:42 AM". */
  sentLabel: string | null;
  resendLabel?: string;
  /** The real cause under "Couldn't build the PDF". */
  errorSub: string;
  onSend: () => void;
  onRetry: () => void;
  onLinkOnly: () => void;
  onPreview: () => void;
}) {
  // These hooks live here, not in the invoice screen: that screen's hooks must
  // all sit above its early returns.
  const [info, setInfo] = useState<{ pages: number; bytes: number } | null>(null);
  useEffect(() => {
    if (!file) { setInfo(null); return; }
    let live = true;
    void file.arrayBuffer().then(
      (buf) => { if (live) setInfo({ pages: countPdfPages(new Uint8Array(buf)), bytes: file.size }); },
      () => { if (live) setInfo({ pages: 0, bytes: file.size }); },
    );
    return () => { live = false; };
  }, [file]);
  useEffect(() => {
    if (queued && ready) onQueuedReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, ready]);
  const meta = info ? pdfMetaLine(info.pages, info.bytes) : null;

  const fileTile = (pop: boolean) => (
    <div
      className={pop ? 'al-anim' : undefined}
      style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--al-gold-soft)', display: 'grid', placeItems: 'center', color: 'var(--al-gold-text)', flex: 'none', animation: pop ? 'al-pop-in .3s both' : undefined }}
    >
      <Icon name="picture_as_pdf" size={18} />
    </div>
  );

  return (
    <div className="al-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {phase === 'building' && (
        <>
          <div style={{ ...ROW, position: 'relative', overflow: 'hidden' }} role="status" aria-live="polite">
            <div
              className="al-anim"
              aria-hidden
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(212,175,55,.18),transparent)', backgroundSize: '240px 100%', backgroundRepeat: 'no-repeat', animation: 'al-shim 1.4s linear infinite' }}
            />
            <div className="al-anim" style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid var(--al-wline)', borderTopColor: 'var(--al-gold-deep)', animation: 'al-spin .8s linear infinite', flex: 'none' }} />
            <div style={{ flex: 1, font: inter('600 14px') }}>Building PDF…</div>
            <span style={{ ...mono, fontSize: 11.5, color: 'var(--al-meta)' }}>{fileName}</span>
          </div>
          <button type="button" className="al-btn-g" onClick={onSend}>Send invoice<Icon name="send" size={18} /></button>
          <div style={{ fontSize: 12, color: 'var(--al-mute)', textAlign: 'center' }}>You can send now. The PDF attaches the moment it&apos;s ready.</div>
        </>
      )}

      {phase === 'ready' && (
        <>
          <div style={ROW}>
            {fileTile(true)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: inter('600 14px') }}>{fileName}</div>
              {meta && <div style={{ fontSize: 11.5, color: '#7a7166' }}>{meta}</div>}
            </div>
            <button type="button" onClick={onPreview} style={{ font: inter('600 13px'), color: 'var(--al-gold-link)', background: 'none', border: 0, cursor: 'pointer', padding: '8px 2px' }}>Preview</button>
          </div>
          <button type="button" className="al-btn-g" onClick={onSend}>Send invoice<Icon name="send" size={18} /></button>
        </>
      )}

      {phase === 'error' && (
        <>
          <div style={{ ...ROW, background: 'var(--al-err-bg)', border: '1px solid var(--al-err-line)', padding: '0 8px 0 12px' }} role="alert">
            <span style={{ color: 'var(--al-rust)', display: 'inline-flex' }}><Icon name="warning" size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: inter('600 14px'), color: 'var(--al-err-ink)' }}>Couldn&apos;t build the PDF</div>
              <div style={{ fontSize: 11.5, color: 'var(--al-err-sub)' }}>{errorSub}</div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              style={{ height: 32, padding: '0 12px', borderRadius: 16, background: '#fff', border: '1px solid var(--al-err-line)', font: inter('700 13px'), color: 'var(--al-err-ink)', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
          <button type="button" className="al-btn-w" onClick={onLinkOnly}>Send link only<Icon name="link" size={18} /></button>
        </>
      )}

      {phase === 'sending' && (
        <>
          <div style={ROW}>
            {fileTile(false)}
            <div style={{ flex: 1 }}>
              <div style={{ font: inter('600 14px') }}>{fileName}</div>
              {meta && <div style={{ fontSize: 11.5, color: '#7a7166' }}>{meta.replace(' · attached', '')} · attached</div>}
            </div>
          </div>
          <button type="button" className="al-btn-g" disabled aria-busy>
            <span className="al-anim" style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(35,28,11,.25)', borderTopColor: '#231c0b', animation: 'al-spin .8s linear infinite' }} />Sending…
          </button>
        </>
      )}

      {phase === 'sent' && (
        <>
          <div style={ROW}>
            <div className="al-anim" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none', animation: 'al-pop-in .3s both' }}>
              <Icon name="check" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: inter('600 14px') }}>{clientFirst ? `Sent to ${clientFirst}` : 'Sent'}</div>
              {sentLabel && <div style={{ fontSize: 11.5, color: '#7a7166' }}>{sentLabel}</div>}
            </div>
          </div>
          <button type="button" className="al-btn-w" onClick={onSend}>{resendLabel ?? 'Resend'}</button>
        </>
      )}
    </div>
  );
}
