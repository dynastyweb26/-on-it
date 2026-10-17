'use client';
// "Tell us about On It" (FEEDBACK-SPEC.md §1). One screen: a tag, a message,
// optional stars. A failed send keeps what was typed and offers Retry; the
// done state replaces the form. Nothing here reads the database: the server
// route decides everything.
import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { FEEDBACK_MAX, FEEDBACK_MIN, FEEDBACK_TAGS, TAG_LABEL, type FeedbackSource, type FeedbackTag } from '@/lib/feedback';
import { sendFeedback } from '@/lib/feedback-actions';

const TAG_HINT: Record<FeedbackTag, string> = {
  idea: 'Something you wish it did',
  problem: 'Something that’s annoying or broken',
  love: 'Something that’s working well',
};

export default function FeedbackScreen() {
  const [tag, setTag] = useState<FeedbackTag | null>(null);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const trimmed = message.trim();
  const ready = tag !== null && trimmed.length >= FEEDBACK_MIN && !busy;

  async function send() {
    if (!tag || !ready) return;
    setBusy(true);
    setError(null);
    // Where the user came from (Chat prompt passes ?src=chat_prompt&from=/chat).
    const q = new URLSearchParams(window.location.search);
    const source: FeedbackSource = q.get('src') === 'chat_prompt' ? 'chat_prompt' : 'settings';
    const from = q.get('from') ?? undefined;
    const r = await sendFeedback({
      tag,
      message: trimmed,
      ...(rating ? { rating } : {}),
      source,
      screen: from && from.startsWith('/') ? from : undefined,
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.message);
  }

  if (done) {
    return (
      <Shell>
        <section className="card space-y-3">
          <p className="flex items-center gap-2 font-display text-[20px] font-bold text-on-background">
            <Icon name="check_circle" size={24} className="text-primary" /> Thank you.
          </p>
          <p className="text-sm text-on-surface-variant">
            I read every one, and I’ll reply by email if there’s something to say.
          </p>
          <Link href="/settings/help" className="btn-primary w-full">Back to Help</Link>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="px-1 text-[15px] text-on-surface-variant">
        What’s working, what’s annoying, what do you wish it did?
      </p>

      <section className="card space-y-3" aria-label="What kind of feedback">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">What is it?</h2>
        <div role="radiogroup" aria-label="Kind of feedback" className="grid grid-cols-3 rounded-[14px] bg-surface-container-high p-1">
          {FEEDBACK_TAGS.map((t) => {
            const on = tag === t;
            return (
              <button key={t} type="button" role="radio" aria-checked={on} onClick={() => setTag(t)}
                className={`h-11 rounded-[10px] text-[15px] transition-colors active:scale-95
                  ${on ? 'bg-surface-container-lowest font-semibold text-on-background shadow-sm' : 'font-medium text-on-surface-variant'}`}>
                {TAG_LABEL[t]}
              </button>
            );
          })}
        </div>
        <p className="px-1 text-sm text-on-surface-variant">{tag ? TAG_HINT[tag] : 'Pick one'}</p>
      </section>

      <section className="card space-y-3">
        <label className="block rounded-card border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5">
          <span className="block text-[13px] text-on-surface-variant">Tell us</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX))}
            rows={6} maxLength={FEEDBACK_MAX} aria-label="Your feedback"
            className="mt-1 w-full resize-none bg-transparent text-[15px] text-on-background outline-none" />
        </label>
        <p className="px-1 text-right text-[13px] text-on-surface-variant">{message.length}/{FEEDBACK_MAX}</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          How’s On It going? · optional
        </h2>
        <div role="radiogroup" aria-label="Rating from 1 to 5" className="grid grid-cols-5 rounded-[14px] bg-surface-container-high p-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = rating === n;
            return (
              <button key={n} type="button" role="radio" aria-checked={on}
                onClick={() => setRating(on ? null : n)}
                className={`h-11 rounded-[10px] text-[15px] transition-colors active:scale-95
                  ${on ? 'bg-surface-container-lowest font-semibold text-on-background shadow-sm' : 'font-medium text-on-surface-variant'}`}>
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between px-1 text-[13px] text-on-surface-variant">
          <span>Rough</span><span>Great</span>
        </div>
      </section>

      <section className="space-y-2">
        {error && (
          <p className="px-1 text-sm text-error" role="alert">{error}</p>
        )}
        <button className="btn-primary w-full" disabled={!ready} onClick={() => void send()}>
          {busy ? 'Sending…' : error ? 'Retry' : 'Send'}
        </button>
        <p className="px-1 text-center text-sm text-on-surface-variant">
          I read every one, and I’ll reply by email if there’s something to say.
        </p>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 overflow-x-hidden px-4 py-4 md:px-6">
      <div className="flex items-center gap-1">
        <Link href="/settings/help" aria-label="Back to Help & feedback"
          className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-background active:bg-surface-container">
          <Icon name="arrow_back" size={24} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-[26px] font-extrabold leading-tight text-on-background">Tell us about On It</h1>
      </div>
      {children}
    </div>
  );
}
