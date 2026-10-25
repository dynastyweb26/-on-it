'use client';
// Step 2 · Try On It free for 14 days — what happens, in order, and on which
// dates: today costs nothing, we email a reminder TRIAL_REMINDER_DAYS before
// the end, and the plan starts on the end date. Both dates come from
// trialDates() (lib/trial), the same function /api/checkout's trial and the
// reminder cron work from, so the page cannot promise a different window.
//
// The reminder is static text, not a toggle: the email is the cron's job
// (/api/trial-reminders). There is nothing here to switch off.
//
// Testimonial: held behind SHOW_TESTIMONIAL. A real customer quote needs their
// permission and their name, so nothing renders (and no placeholder quote
// ships) until that constant is flipped with cleared copy.
import { useState } from 'react';
import Icon from '@/components/Icon';
import { STEP_TITLE, TRIAL_COPY } from '@/lib/paywall-copy';
import { TRIAL_DAYS, trialDates } from '@/lib/trial';

/** Flip only with a cleared, attributed quote from a real customer. */
export const SHOW_TESTIMONIAL = false;

const TESTIMONIAL = {
  quote: '',
  name: '',
  role: '',
};

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Stop({ icon, label, value, meta }: {
  icon: 'payments' | 'mail' | 'schedule';
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <li className="relative flex gap-3">
      <span className="relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#efe4d2] bg-surface-container-lowest">
        <Icon name={icon} size={15} className="text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-[15px] font-bold">{label}</span>
          <span className="shrink-0 text-[15px] font-semibold">{value}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-[18px] text-on-surface-variant">{meta}</p>
      </div>
    </li>
  );
}

export default function TrialStep() {
  // Fixed for the visit: the dates must not shift under the reader.
  const [{ end, remind }] = useState(() => trialDates());

  return (
    <div className="flex flex-col gap-4 px-4">
      <h2
        id="paywall-step-title"
        tabIndex={-1}
        className="text-center font-display text-[22px] font-extrabold tracking-[-0.01em] outline-none"
      >
        {STEP_TITLE.trial}
      </h2>

      <div className="rounded-2xl border border-[#efe4d2] bg-surface-container-lowest px-4 py-4">
        <ol className="relative flex flex-col gap-4">
          {/* the timeline's spine, behind the step marks */}
          <span aria-hidden className="absolute bottom-3 left-3 top-3 w-px bg-[#efe4d2]" />
          <Stop
            icon="payments"
            label={TRIAL_COPY.todayLabel}
            value={TRIAL_COPY.todayAmount}
            meta={`Your ${TRIAL_DAYS}-day trial starts — no charge today`}
          />
          <Stop
            icon="mail"
            label={TRIAL_COPY.reminderLabel}
            value={short(remind)}
            meta={TRIAL_COPY.reminderText}
          />
          <Stop
            icon="schedule"
            label={TRIAL_COPY.startLabel}
            value={TRIAL_COPY.startAmount}
            meta={`${short(end)} · your first charge`}
          />
        </ol>
      </div>

      {SHOW_TESTIMONIAL && TESTIMONIAL.quote && (
        <figure className="rounded-2xl border border-[#efe4d2] bg-surface-container-lowest p-4">
          <blockquote className="text-[15px] leading-[22px]">“{TESTIMONIAL.quote}”</blockquote>
          <figcaption className="mt-2 text-[13px] leading-[18px] text-on-surface-variant">
            {TESTIMONIAL.name} · {TESTIMONIAL.role}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
