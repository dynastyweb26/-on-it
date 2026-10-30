'use client';
// The bank toast (SPEC.txt · R9 "Toast after add", position overridden by
// CHANGES.md · item 5): dark pill, gold check disc, holds 2.4s, sits at the TOP
// of the sheet under the counter so it never covers an action button.
// Tapping anywhere on it dismisses it immediately.
//
// Accessibility: the message is announced once through a visually hidden
// role="status" node, so the tappable pill can be a real button (44px target,
// labelled "Dismiss") without nesting live-region semantics inside it.
import { useEffect } from 'react';
import Icon from '@/components/Icon';

export const BANK_TOAST_MS = 2400;

export default function BankToast({ message, onDone, className = '' }: {
  message: string;
  onDone: () => void;
  className?: string;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, BANK_TOAST_MS);
    return () => clearTimeout(t);
  }, [onDone, message]);

  return (
    <div className={`relative ${className}`}>
      <span role="status" aria-live="polite" className="sr-only">{message}</span>
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDone}
        className="bank-toast-in flex min-h-[52px] w-full items-center gap-3 rounded-[18px] bg-inverse-surface px-4 py-3.5 text-left text-inverse-on-surface shadow-[0_12px_28px_-10px_rgba(30,24,14,.45)] transition-transform active:scale-[0.99]"
      >
        <span aria-hidden className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-primary-container text-on-background">
          <Icon name="check" size={18} />
        </span>
        <span className="text-[15px] font-medium">{message}</span>
      </button>
    </div>
  );
}
