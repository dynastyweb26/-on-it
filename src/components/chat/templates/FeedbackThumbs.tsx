'use client';
// feedback.thumbs — design/ai-templates/Feedback.dc.html. Whether the thumbs may
// show, and what a tap does to the vote, are lib/templates/thumbs.ts. Saving is
// the host's: this card reports through onVote (the host calls feedback-store's
// save / clear), and a rejected promise is the design's "Didn't send" state.
import { useEffect, useRef, useState } from 'react';
import { Sym, tap } from './shared';
import { FEEDBACK_CHIPS, reasonsForChips } from '@/lib/templates/reasons';
import { afterVote, thumbDecision, type ThumbReply, type ThumbVote } from '@/lib/templates/thumbs';
import type { FeedbackThumbsProps } from '@/lib/templates/props';
import type { FeedbackThumbsCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

type Initial = { reasons: readonly string[]; note: string };

function start(state: FeedbackThumbsProps['state']) {
  return {
    vote: (state === 'up' ? 'up' : state === 'idle' ? null : 'down') as ThumbVote | null,
    open: state === 'open' || state === 'openFilled' || state === 'error',
    failed: state === 'error',
  };
}

export default function FeedbackThumbs({
  state = 'idle', initial, reply, onVote,
}: FeedbackThumbsProps & FeedbackThumbsCallbacks & {
  /** Sample picks for the open states belong to the fixtures page, never to the card. */
  initial?: Initial;
  /** When given, thumbs.ts decides whether the set shows at all, and it fades in. */
  reply?: ThumbReply;
}) {
  const [s, setS] = useState(() => start(state));
  const [picked, setPicked] = useState<string[]>(() => [...(initial?.reasons ?? [])]);
  const [note, setNote] = useState(initial?.note ?? '');
  const sending = useRef(false); // synchronous: a second Send tap never posts twice
  const voting = useRef(false); // synchronous: a second thumb tap waits for the first save
  const [failedMsg, setFailedMsg] = useState<string | null>(null); // the cause, from a rejected onVote
  const [bareError, setBareError] = useState<string | null>(null); // a thumb that did not save

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setS(start(state));
    setPicked([...(initial?.reasons ?? [])]);
    setNote(initial?.note ?? '');
    sending.current = false;
    voting.current = false;
    setFailedMsg(null);
    setBareError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const { vote, open, failed } = s;
  const can = picked.length > 0 || note.trim().length > 0;

  if (reply && !thumbDecision({ ...reply, vote, followUpOpen: open }).show) return null;

  const thumb = async (which: ThumbVote) => {
    if (voting.current || sending.current) return;
    voting.current = true;
    const before = s;
    const next = afterVote(vote, which);
    setS((p) => ({ ...p, vote: next.vote, open: next.followUpOpen }));
    setBareError(null);
    try {
      await onVote?.(next.vote);
    } catch (e) {
      // The vote un-fills and the cause is named (the host's message).
      setS(before);
      setBareError(e instanceof Error && e.message ? e.message : 'Could not save.');
    } finally {
      voting.current = false;
    }
  };
  const close = () => setS((p) => ({ ...p, open: false }));
  const send = async () => {
    if (!can || sending.current) return;
    sending.current = true;
    try {
      await onVote?.('down', reasonsForChips(picked), note.trim());
      setS((p) => ({ ...p, open: false, failed: false }));
      setFailedMsg(null);
    } catch (e) {
      setS((p) => ({ ...p, failed: true }));
      setFailedMsg(e instanceof Error && e.message ? e.message : null);
    } finally {
      sending.current = false;
    }
  };

  const mk = (which: ThumbVote, icon: string, label: string) => {
    const on = vote === which;
    const t = tap(() => thumb(which));
    return (
      <div
        {...t}
        aria-label={label}
        aria-pressed={on}
        className={`${t.className} tpl-hover-bubble`}
        style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Sym name={icon} size={18} color={on ? 'var(--tpl-thumb-on)' : 'var(--tpl-thumb-off)'} style={{ fontVariationSettings: on ? "'FILL' 1" : "'FILL' 0" }} />
      </div>
    );
  };

  return (
    <div
      data-template="feedback.thumbs"
      data-state={state}
      className={reply ? 'tpl-fade' : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      <div style={{ display: 'flex', gap: 0, marginLeft: -10 }}>
        {mk('up', 'thumb_up', 'Good response')}
        {mk('down', 'thumb_down', 'Bad response')}
      </div>

      {bareError && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--tpl-red)' }}>
          <Sym name="error" size={16} />
          {bareError}
        </div>
      )}

      {open && (
        <div className="tpl-xl-420" style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 20, padding: '14px 14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>What went wrong?</div>
            <div {...tap(close)} aria-label="Close" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--tpl-skel)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Sym name="close" size={18} color="var(--tpl-ink)" />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FEEDBACK_CHIPS.map(({ label }) => {
              const on = picked.includes(label);
              return (
                <div
                  key={label}
                  {...tap(() => setPicked((p) => (on ? p.filter((x) => x !== label) : [...p, label])))}
                  style={{ boxSizing: 'content-box', display: 'inline-flex', alignItems: 'center', gap: 4, height: 40, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 500, border: `1.5px solid ${on ? 'var(--tpl-thumb-on)' : 'var(--tpl-btn-border)'}`, background: on ? 'var(--tpl-thumb-on)' : 'var(--tpl-white)', color: on ? 'var(--tpl-chip-on-fg)' : 'var(--tpl-ink)' }}
                >
                  {on && <Sym name="check" size={16} />}
                  {label}
                </div>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note (optional)"
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--tpl-field-border)', borderRadius: 14, padding: '10px 12px', fontFamily: 'var(--font-inter), Inter, sans-serif', fontSize: 15, lineHeight: 1.4, color: 'var(--tpl-ink)', background: 'var(--tpl-white)', resize: 'none', outline: 'none' }}
          />
          {failed && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--tpl-red)' }}>
              <Sym name="error" size={16} />
              {failedMsg ?? "Didn't send. Your picks are kept."}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div {...tap(close)} style={{ boxSizing: 'content-box', flex: 1, height: 44, borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>Skip</div>
            <div {...tap(send)} style={{ flex: 1, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, background: can ? 'var(--tpl-gold)' : 'var(--tpl-gold-soft)', color: can ? 'var(--tpl-ink)' : 'var(--tpl-send-off-fg)' }}>{failed ? 'Try again' : 'Send'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
