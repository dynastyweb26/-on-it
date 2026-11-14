'use client';
// feedback.checkin — design/ai-templates/CheckIn.dc.html. The occasional "How's On It
// working for you?" card. When it may appear (once every 30 days, never mid-task)
// is the host's decision; this card draws open, picked and dismissed.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MONO, Sym, tap } from './shared';
import type { FeedbackCheckinProps } from '@/lib/templates/props';
import type { FeedbackCheckinCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

const CHOICES = ['Not great', "It's okay", 'Love it'] as const;
type Choice = (typeof CHOICES)[number];

export default function FeedbackCheckin({
  state = 'open', picked, onDismiss, onPick,
}: FeedbackCheckinProps & FeedbackCheckinCallbacks & {
  /** The choice already made, for the picked state; the fixtures page supplies the sample. */
  picked?: Choice;
}) {
  const [pick, setPick] = useState<Choice | null>(state === 'picked' ? (picked ?? null) : null);
  const [gone, setGone] = useState(state === 'dismissed');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setPick(state === 'picked' ? (picked ?? null) : null);
    setGone(state === 'dismissed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div data-template="feedback.checkin" data-state={state} style={{ width: '100%' }}>
      {!gone && (
        <div
          className="tpl-xl-420"
          style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, padding: '14px 12px 8px 16px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--tpl-eyebrow)' }}>Quick check-in</div>
              <div style={{ fontFamily: 'var(--font-montserrat), Montserrat, sans-serif', fontWeight: 800, fontSize: 18, lineHeight: 1.25, textWrap: 'pretty' }}>How&apos;s On It working for you?</div>
            </div>
            <div
              {...tap(() => { setGone(true); onDismiss?.(); })}
              aria-label="Dismiss"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--tpl-skel)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
            >
              <Sym name="close" size={18} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 4, padding: 4, borderRadius: 16, background: 'var(--tpl-seg)', marginRight: 4 }}>
            {CHOICES.map((l) => {
              const on = pick === l;
              return (
                <div
                  key={l}
                  {...tap(() => { setPick(l); onPick?.(l); })}
                  aria-pressed={on}
                  style={{ height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, whiteSpace: 'nowrap', background: on ? 'var(--tpl-white)' : 'transparent', fontWeight: on ? 600 : 500, color: on ? 'var(--tpl-ink)' : 'var(--tpl-muted-2)', boxShadow: on ? '0 1px 3px rgba(50,40,25,.14)' : 'none' }}
                >
                  {l}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <div style={{ fontSize: 14, color: 'var(--tpl-muted-2)' }}>{pick ? 'Got it. Saved.' : 'Takes one tap.'}</div>
            <Link
              href="/settings/help/feedback?src=chat_prompt&from=/chat"
              style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 15, fontWeight: 600, color: 'var(--tpl-gold-ink)', textDecoration: 'none', height: 44, paddingLeft: 8 }}
            >
              Tell us more
              <Sym name="chevron_right" size={20} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
