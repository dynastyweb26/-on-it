'use client';
// The template's Price / Quantity keypad (release frames 1i, 7d; merge 2 ·
// 2·11). A bottom sheet with no text field, so the OS keyboard never opens:
// "Price for Labor" / "Quantity of Interior painting", the big value
// ("$320", "120 sq ft"), a context line ("per hour" / "× $1.50 = $180.00"),
// keys 1–9 . 0 ⌫ and the gold Set button. The first digit replaces the
// starting value; ⌫ edits it instead. Cancel, the scrim, Escape and a
// swipe down on the header close without changing anything.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import { calculateLineAmount, money } from '@/lib/financials';
import { KEYS, keypadText, keypadValue, pressKey, type Key, type KeypadKind } from '@/lib/keypad';
import { unitLabel, type LineUnit } from '@/lib/line-units';
import { useSheetDrag } from '@/lib/use-sheet-drag';

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export default function KeypadSheet({ kind, itemName, unit, value, otherValue, onSet, onClose }: {
  kind: KeypadKind;
  itemName: string;
  unit: LineUnit | null;
  /** The current qty / price. */
  value: number | null;
  /** The other factor (price when setting qty, qty when setting price), for the context line. */
  otherValue: number | null;
  onSet: (v: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => keypadText(value));
  // The first digit replaces the starting value (calculator-style); ⌫ edits it.
  const fresh = useRef(true);
  const press = (k: Key) => setText((t) => {
    const startOver = fresh.current && k !== 'back';
    fresh.current = false;
    return pressKey(startOver ? '' : t, k, kind);
  });
  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter') onSet(keypadValue(text, kind));
      else if (e.key === 'Backspace') press('back');
      else if (/^[0-9.]$/.test(e.key)) press(e.key as Key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onSet, text, kind]);

  const label = unitLabel(unit);
  const n = keypadValue(text, kind);
  const shown = kind === 'price'
    ? (text === '' ? '$0' : `$${text}`)
    : `${text === '' ? '1' : text}${label ? ` ${label}` : ''}`;
  const context = kind === 'price'
    ? (unit && unit !== 'each' ? `per ${unit}` : null)
    : (otherValue != null ? `× ${fmtMoney(otherValue)} = ${money(calculateLineAmount(n ?? 1, otherValue))}` : null);
  const title = kind === 'price' ? 'Price' : 'Quantity';
  const lead = kind === 'price' ? `Price for ${itemName || 'this item'}` : `Quantity of ${itemName || 'this item'}`;

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end justify-center" data-no-tab-swipe="true">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} style={sheetStyle}
        className="onit-sheet-in relative w-full max-w-lg rounded-t-card bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised">
        <div data-sheet-handle="" className="cursor-grab select-none" {...handleProps}>
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-outline-variant" />
          <div className="relative flex h-12 items-center justify-center">
            <button type="button" onClick={onClose} className="absolute left-0 min-h-touch px-1 text-[17px] text-primary">Cancel</button>
            <h2 className="text-[17px] font-bold text-on-background">{title}</h2>
          </div>
        </div>

        <div className="pb-4 pt-2 text-center">
          <p className="truncate text-[14px] text-on-surface-variant">{lead}</p>
          <p aria-live="polite" className="mt-1 truncate font-display text-[44px] font-extrabold leading-tight text-on-background tabular-nums">{shown}</p>
          {context && <p className={`text-[13.5px] ${kind === 'qty' ? 'text-primary' : 'text-on-surface-variant'}`}>{context}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
          {KEYS.map((k) => (
            <button key={k} type="button" aria-label={k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}
              onClick={() => press(k)}
              className="grid h-14 place-items-center rounded-[14px] border border-outline-variant/70 bg-surface-container-lowest font-display text-[24px] font-bold text-on-background transition active:scale-95 active:bg-surface-container">
              {k === 'back' ? <Icon name="backspace" size={26} /> : k}
            </button>
          ))}
        </div>

        <button type="button" onClick={() => onSet(keypadValue(text, kind))}
          className="btn-primary mt-3 w-full">
          {kind === 'price' ? 'Set price' : 'Set quantity'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
