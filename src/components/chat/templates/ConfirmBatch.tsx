'use client';
// confirm.batch — design/ai-templates/BatchConfirm.dc.html. Every transition is a
// function in src/lib/templates/confirm-batch.ts; this card draws the machine's
// state. The design's fake 1.1s timer is not here: the host runs the real
// request (onPrimary) and moves the card on by changing `state`.
import { useEffect, useRef, useState } from 'react';
import { Sym, TONE, tap } from './shared';
import { batchFromProps, rowsFromActions } from './confirm-batch-view';
import { batchHeadline, beginConfirm, failedCount, removeRow, startBatch, undoAll } from '@/lib/templates/confirm-batch';
import type { ConfirmBatchProps } from '@/lib/templates/props';
import type { ConfirmBatchCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

const LINE = '1px solid var(--tpl-line)';
const MONT = 'var(--font-montserrat), Montserrat, sans-serif';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export default function ConfirmBatch({
  state = 'pending', statuses, actions, onPrimary, onRemove, onUndo,
}: ConfirmBatchProps & ConfirmBatchCallbacks & { statuses?: readonly ('saved' | 'failed' | undefined)[] }) {
  const [batch, setBatch] = useState(() => batchFromProps(state, statuses, actions));
  const busy = useRef(batch.phase === 'confirming'); // synchronous: a second tap never gets past it
  const loading = state === 'loading';
  const statusKey = (statuses ?? []).join(','); // a new array each render must not reset the card

  // A new `state` from the host moves the card on, as the design's componentDidUpdate does.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const next = batchFromProps(state, statuses, actions);
    busy.current = next.phase === 'confirming';
    setBatch(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, statusKey]);

  const ph = loading ? 'loading' : batch.phase;
  const n = batch.rows.length;
  const rows = loading ? [] : batch.rows;
  const isEmpty = ph === 'pending' && n === 0;
  const [head, sub] = loading
    ? ['Getting these ready…', 'One moment.']
    : isEmpty
      ? ['Nothing left to confirm.', 'Tell me what to do next.']
      : (() => { const h = batchHeadline(batch); return [h.head, h.sub]; })();
  const confirming = ph === 'confirming';
  const partial = ph === 'partial';
  const done = ph === 'done';
  const failed = batch.rows.find((r) => batch.outcomes[r.id] === 'failed');
  const showFooter = (ph === 'pending' && n > 0) || confirming || partial;

  const primary = () => {
    if (busy.current || (ph !== 'pending' && ph !== 'partial')) return;
    busy.current = true;
    setBatch(beginConfirm(batch));
    onPrimary?.();
  };
  const remove = (id: string, i: number) => {
    if (ph !== 'pending') return;
    setBatch(removeRow(batch, id));
    onRemove?.(Number(id) || i);
  };
  const undo = () => {
    setBatch(undoAll(batch).state);
    onUndo?.();
  };
  const bringBack = () => {
    setBatch(startBatch(rowsFromActions(actions)));
    onUndo?.();
  };

  return (
    <div
      data-template="confirm.batch"
      data-state={state}
      style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, overflow: 'hidden', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      <div style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        {done ? (
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--tpl-gold)', color: 'var(--tpl-ink)', fontSize: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', animation: 'onitPop 420ms cubic-bezier(.2,.9,.3,1.25) both' }}
          >
            check
          </span>
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--tpl-gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Sym name="checklist" size={22} color="var(--tpl-avatar-ink)" />
          </div>
        )}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{head}</div>
          <div style={{ fontSize: 14, color: 'var(--tpl-muted)' }}>{sub}</div>
        </div>
      </div>

      {loading &&
        [1, 2, 3].map((k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: LINE }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--tpl-skel)' }} />
            <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--tpl-skel)' }} />
            <div style={{ width: 56, height: 12, borderRadius: 6, background: 'var(--tpl-skel)' }} />
          </div>
        ))}

      {rows.map((r, i) => {
        const a = actions[Number(r.id)];
        const outcome = batch.outcomes[r.id];
        const bad = partial && outcome === 'failed';
        const ok = done || (partial && outcome !== 'failed');
        const rm = tap(() => remove(r.id, i));
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px 10px 16px', borderTop: LINE, minHeight: 60, boxSizing: 'border-box', opacity: confirming ? 0.55 : 1 }}>
            <Sym name={a.icon} size={20} color="var(--tpl-muted-2)" style={{ flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, ...ELLIPSIS }}>{r.summary}</div>
              {(ok || bad) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: bad ? 'var(--tpl-red)' : 'var(--tpl-paid)' }}>
                  <Sym name={bad ? 'error' : 'check_circle'} size={15} style={{ fontVariationSettings: "'FILL' 1" }} />
                  {bad ? "Didn't save" : 'Saved'}
                </div>
              )}
            </div>
            <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', flex: 'none', color: TONE[a.tone] }}>{r.amount}</div>
            {ph === 'pending' ? (
              <div {...rm} aria-label="Remove" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--tpl-skel)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sym name="close" size={17} color="var(--tpl-muted-2)" />
                </div>
              </div>
            ) : (
              <div style={{ width: 10, flex: 'none' }} />
            )}
          </div>
        );
      })}

      {partial && (
        <div style={{ background: 'var(--tpl-red-soft)', padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4, color: 'var(--tpl-fail-ink)', borderTop: '1px solid var(--tpl-fail-line)' }}>
          <Sym name="error" size={18} />
          <span>{`"${failed?.summary}" didn't save. The connection dropped. The others are saved.`}</span>
        </div>
      )}

      {done && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 52, borderTop: LINE, fontSize: 14, color: 'var(--tpl-muted-2)' }}>
          <span>Saved to your books.</span>
          <span {...tap(undo)} style={{ color: 'var(--tpl-gold-ink)', fontWeight: 600, cursor: 'pointer' }}>Undo all</span>
        </div>
      )}

      {isEmpty && (
        <div style={{ padding: '12px 16px 16px', borderTop: LINE, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, color: 'var(--tpl-muted-2)' }}>
          <span>You removed every change.</span>
          <span {...tap(bringBack)} style={{ color: 'var(--tpl-gold-ink)', fontWeight: 600, cursor: 'pointer' }}>Bring back</span>
        </div>
      )}

      {showFooter && (
        <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 10, borderTop: LINE }}>
          {ph === 'pending' && (
            <div {...tap()} style={{ flex: 1, height: 48, borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>Cancel</div>
          )}
          <div
            {...tap(primary)}
            style={{ flex: 1.6, height: 48, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 16, fontWeight: 600, cursor: 'pointer', background: confirming ? 'var(--tpl-gold-soft)' : 'var(--tpl-gold)', color: 'var(--tpl-ink)' }}
          >
            <Sym name={confirming ? 'progress_activity' : partial ? 'refresh' : 'done_all'} size={19} style={confirming ? { animation: 'onitSpin .9s linear infinite' } : undefined} />
            <span>{confirming ? 'Saving…' : partial ? `Retry ${failedCount(batch)}` : `Confirm all ${n}`}</span>
          </div>
        </div>
      )}
    </div>
  );
}
