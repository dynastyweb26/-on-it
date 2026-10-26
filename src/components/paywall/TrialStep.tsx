'use client';
// Step 2 · Try On It free for 14 days — the trial, laid out as the mockup's
// vertical timeline: today costs nothing, a reminder email lands
// TRIAL_REMINDER_DAYS before the end, and the plan starts on the end date.
// Both dates come from trialDates() (lib/trial), the same function
// /api/checkout's trial and the reminder cron work from, so the page cannot
// promise a different window than the one the account really gets.
//
// The reminder is static text, not a toggle: the email is the cron's job
// (/api/trial-reminders). A switch that controls nothing would be a lie.
import { useState, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import { STEP_TITLE, TRIAL_COPY } from '@/lib/paywall-copy';
import { trialDates } from '@/lib/trial';

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One timeline stop: gold disc, uppercase gold date/eyebrow, the statement,
 *  then whatever the step adds under it. */
function Stop({ icon, eyebrow, title, note, children }: {
  icon: 'lock_open' | 'notifications' | 'event';
  eyebrow: string;
  title: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-container shadow-[0_0_0_5px_#fff8f0]">
        <Icon name={icon} size={22} className="text-on-background" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="font-display text-[11.5px] font-bold uppercase leading-none tracking-[.12em] text-primary">
          {eyebrow}
        </div>
        <div className="mt-1.5 text-[16px] font-semibold leading-[1.35]">{title}</div>
        {note && <p className="mt-0.5 text-[13.5px] leading-[1.4] text-on-surface-variant">{note}</p>}
        {children}
      </div>
    </div>
  );
}

export default function TrialStep() {
  // Fixed for the visit: the dates must not shift under the reader.
  const [{ end, remind }] = useState(() => trialDates());

  return (
    <div className="flex flex-col gap-[22px] px-5 pb-5 pt-2">
      <div>
        <h2
          id="paywall-step-title"
          tabIndex={-1}
          className="font-display text-[29px] font-extrabold leading-[1.12] tracking-[-0.02em] outline-none [text-wrap:balance]"
        >
          {STEP_TITLE.trial}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.45] text-on-surface-variant">{TRIAL_COPY.subtitle}</p>
      </div>

      <div className="relative flex flex-col gap-[22px]">
        {/* the timeline's spine, behind the discs */}
        <span aria-hidden className="absolute bottom-14 left-[21px] top-6 w-[3px] -translate-x-1/2 rounded-[3px] bg-hairline" />
        <Stop
          icon="lock_open"
          eyebrow={TRIAL_COPY.todayEyebrow}
          title={TRIAL_COPY.todayTitle}
          note={TRIAL_COPY.todayNote}
        />
        <Stop
          icon="notifications"
          eyebrow={short(remind)}
          title={TRIAL_COPY.reminderTitle}
        />
        <Stop
          icon="event"
          eyebrow={short(end)}
          title={TRIAL_COPY.startTitle}
        />
      </div>
    </div>
  );
}
