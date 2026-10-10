'use client';
import { useEffect, useState } from 'react';
import { cleanDepositText, depositTextToNumber, settleDeposit } from '@/lib/deposit-input';

// The deposit amount field (chat invoice card + invoice detail page). Keeps the
// typed text as its own state so the field can sit empty mid-edit: a numeric
// value prop alone turns a cleared field into "0", and typing "45" after it
// showed "045" because React saw the same number and never redrew. A text input
// with inputMode="decimal" (number keypad on phones) for the same reason — a
// type="number" input compares loosely and skips the redraw.
//
// Every change saves the number as before (empty saves 0). On blur, empty shows
// "0" and a percentage is capped at 100.

export default function DepositValueInput({ value, mode, onChange, disabled, className, placeholder }: {
  value: number | null | undefined;
  mode: 'percentage' | 'fixed';
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  // Follow outside changes (chat edits, type switch) without clobbering an
  // in-progress edit whose number already matches ("" ↔ 0, "5." ↔ 5).
  useEffect(() => {
    if (value == null) { if (text !== '') setText(''); return; }
    if (depositTextToNumber(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const next = cleanDepositText(e.target.value);
        setText(next);
        onChange(depositTextToNumber(next));
      }}
      onBlur={() => {
        const n = settleDeposit(text, mode);
        const shown = String(n);
        if (shown !== text) setText(shown);
        if (n !== value) onChange(n);
      }}
    />
  );
}
