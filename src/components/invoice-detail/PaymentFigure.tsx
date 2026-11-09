'use client';

// The invoice screen's figure card for the three payment moments of the alive
// layer (design 04): partial, paid in full (Direction A, 1c) and deposit. Every
// value is from On_It_Alive_Layer 04. The celebration plays once (~900ms) and
// only when `celebrate` is set (the payment that just closed the job, never on
// load). Omitted by decision: Send receipt, Mark job done.
import Icon from '@/components/Icon';
import RollMoney from '@/components/RollMoney';
import '@/components/alive/alive.css';

export type PaymentFigureMode = 'partial' | 'paid' | 'deposit';

const money2 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const mono = { fontFamily: 'var(--font-plex-mono), ui-monospace, monospace' } as const;
const body = (css: string) => `${css} var(--font-inter), system-ui, sans-serif`;

export default function PaymentFigure({
  mode, docNumber, clientName, subLine, rightLine, total, amountPaid, balance, depositAmount,
  lastPayment, justRecorded, onUndo, celebrate, paidFrom, format, onViewPayments,
}: {
  mode: PaymentFigureMode;
  docNumber: string;
  clientName: string;
  /** "Invoice · from E-0049 · Sent Nov 7" (partial / paid) or "50% deposit · from E-0049". */
  subLine: string;
  /** "Due Nov 21" / "Closed Nov 7" / "Balance on completion". */
  rightLine: string;
  total: number;
  amountPaid: number;
  balance: number;
  depositAmount: number;
  /** "$50.00 from Ruth · Zelle" pieces for the paid block. */
  lastPayment: { amount: number; from: string; method: string | null } | null;
  justRecorded: { amount: number; methodLabel: string; dateLabel: string } | null;
  onUndo: () => void;
  celebrate: boolean;
  paidFrom: number | null;
  format: (n: number) => string;
  onViewPayments: () => void;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (amountPaid / total) * 100)) : 0;
  const markerPct = total > 0 ? Math.min(100, (depositAmount / total) * 100) : 50;

  const chip =
    mode === 'paid' ? (
      <span className="al-chip al-anim" style={{ background: 'var(--al-green-bg)', color: 'var(--al-green)', animation: celebrate ? 'al-badge-once .18s ease-out both' : undefined }}>
        <Icon name="verified" size={14} />Paid
      </span>
    ) : mode === 'deposit' ? (
      <span className="al-chip" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>
        <Icon name="verified_user" size={14} />Deposit paid
      </span>
    ) : (
      <span className="al-chip" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>● Partial</span>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div className="al-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {chip}
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...mono, fontSize: 14, fontWeight: 700 }}>{docNumber}</div>
          <div style={{ font: body('400 13px'), color: 'var(--al-mute)' }}>{rightLine}</div>
        </div>
      </div>
      <div className="al-h" style={{ fontSize: 28, marginTop: 12 }}>{clientName}</div>
      <div style={{ font: body('400 14px'), color: 'var(--al-mute)' }}>{subLine}</div>

      {mode === 'paid' ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 0 8px' }}>
            <div style={{ position: 'relative', width: 84, height: 84 }}>
              {celebrate && (
                <div className="al-anim" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--al-gold)', animation: 'al-halo-once .9s ease-out .2s both' }} />
              )}
              <div
                className="al-anim"
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', animation: celebrate ? 'al-ring-once .24s cubic-bezier(.2,.9,.3,1.2) both' : undefined }}
              >
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
                  <path
                    className="al-anim-ck"
                    d="M10 21l6.5 6.5L30 14" fill="none" stroke="#1e1a15" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40"
                    style={celebrate ? { animation: 'al-ck-once .36s ease-out .12s both' } : undefined}
                  />
                </svg>
              </div>
            </div>
            <div className="al-h" style={{ fontSize: 24, marginTop: 14 }}>Paid in full</div>
            {lastPayment && (
              <div style={{ font: body('400 14px'), color: 'var(--al-mute)', marginTop: 2 }}>
                {money2(lastPayment.amount)} from {lastPayment.from}{lastPayment.method ? ` · ${lastPayment.method}` : ''}
              </div>
            )}
          </div>
          <div style={{ borderTop: '1.5px dashed var(--al-rule)', margin: '14px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: body('600 14px'), color: 'var(--al-ink2)' }}>Balance</span>
            <span className="al-h" style={{ fontSize: 30, color: 'var(--al-ink)' }}>
              <RollMoney value={balance} from={paidFrom} run={celebrate} format={format} delayMs={300} durationMs={600} />
            </span>
          </div>
          <div className="al-pbar" style={{ marginTop: 10 }}>
            <div className="al-pfill al-anim" style={{ width: '100%', animation: celebrate ? 'al-grow .6s cubic-bezier(.2,.8,.2,1) .3s both' : undefined }} />
          </div>
        </>
      ) : (
        <>
          <div style={{ borderTop: '1.5px dashed var(--al-rule)', margin: '16px 0' }} />
          <div style={{ font: body('600 14px'), color: 'var(--al-ink2)' }}>{mode === 'deposit' ? 'Due when the job’s done' : 'Balance due'}</div>
          <div className="al-h" style={{ fontSize: 44, color: 'var(--al-gold-num)', lineHeight: 1.1 }}>{format(balance)}</div>
          <div style={{ position: 'relative', marginTop: mode === 'deposit' ? 16 : 12 }}>
            <div className="al-pbar">
              <div className="al-pfill al-anim" style={{ width: `${pct}%`, animation: 'al-grow .7s cubic-bezier(.2,.8,.2,1) both' }} />
            </div>
            {mode === 'deposit' && (
              <div style={{ position: 'absolute', left: `${markerPct}%`, top: -5, width: 2, height: 18, background: 'var(--al-ink)', borderRadius: 1 }} />
            )}
          </div>
          {mode === 'deposit' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', font: body('400 12.5px'), color: 'var(--al-mute)', marginTop: 8 }}>
              <span><b style={{ color: 'var(--al-ink)' }}>Deposit</b> {format(depositAmount)} ✓</span>
              <span style={{ textAlign: 'right' }}>Balance {format(balance)}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', font: body('400 13px'), color: 'var(--al-mute)', marginTop: 6 }}>
              <span><b style={{ color: 'var(--al-ink)' }}>{format(amountPaid)}</b> paid</span>
              <span>of {format(total)}</span>
            </div>
          )}
        </>
      )}

      {justRecorded && (
        <div className="al-wcard al-fade-up" style={{ marginTop: 14, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: body('700 14px') }}>Payment recorded</div>
            <div style={{ font: body('400 12.5px'), color: 'var(--al-mute)' }}>{money2(justRecorded.amount)} · {justRecorded.methodLabel} · {justRecorded.dateLabel}</div>
          </div>
          <button type="button" onClick={onUndo} style={{ font: body('600 13px'), color: 'var(--al-gold-link)', background: 'none', border: 0, padding: '8px 4px', cursor: 'pointer' }}>Undo</button>
        </div>
      )}
    </div>
      {mode === 'paid' && (
        <button type="button" className="al-btn-w" style={{ width: '100%' }} onClick={onViewPayments}>View payments</button>
      )}
    </div>
  );
}
