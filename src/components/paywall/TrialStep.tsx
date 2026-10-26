'use client';
// Step 2 · Try On It free for 14 days — what happens, in order, and on which
// dates: today costs nothing, we email a reminder TRIAL_REMINDER_DAYS before
// the end, and the plan starts on the end date. Both dates come from
// trialDates() (lib/trial), the same function /api/checkout's trial and the
// reminder cron work from, so the page cannot promise a different window.
// Layout, spine and motion are design-reference/paywall-mockup.html's.
//
// The reminder is static text, not a toggle: the email is the cron's job
// (/api/trial-reminders). There is nothing here to switch off.
//
// Testimonial: held behind SHOW_TESTIMONIAL. A real customer quote needs their
// permission and their name, so nothing renders (and no placeholder quote
// ships) until that constant is flipped with cleared copy.
import { useState, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { STEP_TITLE, TRIAL_COPY } from '@/lib/paywall-copy';
import { trialDates } from '@/lib/trial';

/** Flip only with a cleared, attributed quote from a real customer. */
export const SHOW_TESTIMONIAL = false;

const TESTIMONIAL = {
  quote: '',
  name: '',
  role: '',
};

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Stop({ icon, pop, rise, label, text, children }: {
  icon: IconName;
  /** The disc's pop-in delay (s). */
  pop: number;
  /** The text's rise delay (s). */
  rise: number;
  label: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-4">
      <span
        className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary-container shadow-[0_0_0_5px_#fff8f0]"
        style={{ animation: `oi-pop .45s ${EASE} ${pop}s both` }}
      >
        <Icon name={icon} size={22} className="text-on-background" />
      </span>
      <div className="min-w-0 flex-1 pt-1" style={{ animation: `oi-up .4s ${EASE} ${rise}s both` }}>
        <div className="font-display text-[11.5px] font-bold uppercase leading-none tracking-[.12em] text-primary">{label}</div>
        <div className="mt-1.5 text-base font-semibold leading-[1.35]">{text}</div>
        {children}
      </div>
    </li>
  );
}

export default function TrialStep() {
  // Fixed for the visit: the dates must not shift under the reader.
  const [{ end, remind }] = useState(() => trialDates());

  return (
    <div
      className="flex flex-col gap-[22px] px-5 pb-5 pt-2"
      style={{ animation: `oi-slide .4s ${EASE} both` }}
    >
      <div>
        <h2
          id="paywall-step-title"
          tabIndex={-1}
          className="font-display text-[29px] font-extrabold leading-[1.12] tracking-[-0.02em] outline-none [text-wrap:balance]"
        >
          {STEP_TITLE.trial}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.45] text-[#4d4635]">{TRIAL_COPY.subtitle}</p>
      </div>

      <ol className="relative flex flex-col gap-[22px]">
        {/* The spine: a track, and the gold line that draws down it disc to
            disc (it ends solid, and is solid at once under reduced motion). */}
        <span aria-hidden className="absolute -ml-[1.5px] bottom-14 left-[21px] top-6 w-[3px] rounded-[3px] bg-[#efe4d2]" />
        <span
          aria-hidden
          className="absolute -ml-[1.5px] bottom-14 left-[21px] top-6 w-[3px] origin-top rounded-[3px] bg-primary-container"
          style={{ animation: `oi-grow 1.6s ${EASE} .2s both` }}
        />
        <Stop icon="lock_open" pop={.15} rise={.3} label={TRIAL_COPY.todayLabel} text={TRIAL_COPY.todayText}>
          <p className="mt-[3px] text-[13.5px] leading-[1.4] text-[#4d4635]">{TRIAL_COPY.todayMeta}</p>
        </Stop>
        <Stop icon="notifications" pop={.8} rise={.95} label={short(remind)} text={TRIAL_COPY.reminderText}>
          <div className="mt-2.5 flex items-center gap-2.5 rounded-[14px] border border-[#efe4d2] bg-white px-3 py-2.5">
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-[#f1e6d3]">
              <Icon name="mail" size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold leading-tight">Your trial ends {short(end)}</div>
              <div className="text-[11.5px] leading-[1.3] text-[#4d4635]">{TRIAL_COPY.reminderMeta}</div>
            </div>
          </div>
        </Stop>
        <Stop icon="schedule" pop={1.45} rise={1.6} label={short(end)} text={TRIAL_COPY.startText} />
      </ol>

      <div
        className="flex flex-col gap-2.5 rounded-2xl border border-[#efe4d2] bg-white px-4 py-3.5 font-mono text-[13px] leading-none"
        style={{ animation: `oi-up .45s ${EASE} 1.9s both` }}
      >
        <div className="flex justify-between"><span>{TRIAL_COPY.dueTodayLabel}</span><span className="font-semibold">{TRIAL_COPY.todayAmount}</span></div>
        <div className="h-0 border-t-[1.5px] border-dashed border-[#e6d9c3]" />
        <div className="flex justify-between text-[#4d4635]"><span>From {long(end)}</span><span>{TRIAL_COPY.startAmount}</span></div>
      </div>

      <p
        className="flex items-center justify-center gap-1.5 text-[13.5px] font-medium leading-none text-[#4d4635]"
        style={{ animation: 'oi-in .4s ease-out 2.1s both' }}
      >
        <Icon name="settings" size={17} />{TRIAL_COPY.cancelNote}
      </p>

      {SHOW_TESTIMONIAL && TESTIMONIAL.quote && (
        <figure className="rounded-2xl border border-[#efe4d2] bg-white p-4">
          <blockquote className="text-[15px] leading-[22px]">“{TESTIMONIAL.quote}”</blockquote>
          <figcaption className="mt-2 text-[13px] leading-[18px] text-[#4d4635]">
            {TESTIMONIAL.name} · {TESTIMONIAL.role}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
