'use client';
// The bank toast (SPEC.txt · R9 "Toast after add"): dark pill, gold check disc,
// rises 16px, holds 2.4s. Never steals focus (role="status"), never carries an
// amount. Reused by the review stack and, later, the Books summary.
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
    <div
      role="status"
      className={`pointer-events-none flex items-center gap-3 rounded-[18px] bg-inverse-surface px-4 py-3.5 text-inverse-on-surface shadow-[0_12px_28px_-10px_rgba(30,24,14,.45)] bank-toast-in ${className}`}
    >
      <span aria-hidden className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-primary-container text-on-background">
        <Icon name="check" size={18} />
      </span>
      <span className="text-[15px] font-medium">{message}</span>
    </div>
  );
}
