'use client';
// Shared line-item list with inline editing of description, quantity, and unit
// price — used by the chat confirmation card and the draft invoice detail page,
// so the edit interaction can't drift between them. Tap a value to edit it;
// blur or Enter commits, Escape cancels. The component never persists: it emits
// the new items via onChange and the parent decides what to do (a draft in
// React state, or a DB write with recomputed totals). Amounts are validated
// here — non-negative, bounded, snapped to two decimals.
import { useState } from 'react';

export interface EditableLineItem {
  description: string;
  qty: number;
  unit_price: number;
  // Preserved through edits (item 3 training signal); this component never sets it.
  original_description?: string | null;
}

type Field = 'description' | 'qty' | 'unit_price';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';
// qty: 0..100000, up to 2 decimals (fractional hours are legitimate).
const clampQty = (n: number) => Math.min(100000, Math.max(0, Math.round(n * 100) / 100));
// price: 0..10,000,000, snapped to cents.
const clampPrice = (n: number) => Math.min(10_000_000, Math.max(0, Math.round(n * 100) / 100));

export default function LineItemsEditor({
  items,
  editable,
  onChange,
}: {
  items: EditableLineItem[];
  editable: boolean;
  onChange: (items: EditableLineItem[]) => void;
}) {
  const [cell, setCell] = useState<{ i: number; f: Field } | null>(null);
  const [text, setText] = useState('');

  function start(i: number, f: Field, current: string) {
    setText(current);
    setCell({ i, f });
  }

  function commit() {
    if (!cell) return;
    const { i, f } = cell;
    setCell(null);
    const cur = items[i];
    if (!cur) return;
    let next: EditableLineItem;
    if (f === 'description') {
      const t = text.trim();
      if (!t || t === cur.description) return; // empty or unchanged — no-op
      next = { ...cur, description: t };
    } else {
      const raw = text.trim();
      if (raw === '') return; // cleared — keep the previous value
      const n = Number(raw);
      if (!Number.isFinite(n)) return; // non-numeric — no-op
      const v = f === 'qty' ? clampQty(n) : clampPrice(n);
      const curVal = f === 'qty' ? cur.qty : cur.unit_price;
      if (v === curVal) return;
      next = { ...cur, [f]: v };
    }
    onChange(items.map((li, idx) => (idx === i ? next : li)));
  }

  const editingHere = (i: number, f: Field) => editable && cell?.i === i && cell.f === f;

  function cellInput(aria: string, numeric: boolean) {
    return (
      <input
        autoFocus
        className={`rounded-md border border-primary/50 bg-surface-container-lowest px-2 py-1 text-on-background outline-none focus:border-primary ${numeric ? 'w-24 text-right' : 'min-w-0 flex-1 text-body-md'}`}
        value={text}
        inputMode={numeric ? 'decimal' : 'text'}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setCell(null); }
        }}
        aria-label={aria}
      />
    );
  }

  const editBtn = 'underline decoration-dotted decoration-outline-variant/60 underline-offset-4 transition active:opacity-60';

  return (
    <>
      {items.map((li, i) => (
        <div key={i} className="py-1 text-body-md">
          <div className="flex items-center justify-between gap-2">
            {editingHere(i, 'description') ? (
              cellInput('Edit line item description', false)
            ) : editable ? (
              <button type="button" className={`min-w-0 flex-1 truncate text-left ${editBtn}`}
                onClick={() => start(i, 'description', li.description)}
                aria-label={`Edit description: ${li.description}`}>
                {li.description}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate">{li.description}</span>
            )}
            <span className="shrink-0 font-display font-bold">{money(Number(li.qty) * Number(li.unit_price))}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-on-surface-variant">
            {editingHere(i, 'qty') ? (
              cellInput('Edit quantity', true)
            ) : editable ? (
              <button type="button" className={editBtn}
                onClick={() => start(i, 'qty', String(li.qty))} aria-label={`Edit quantity: ${li.qty}`}>
                {li.qty}
              </button>
            ) : (
              <span>{li.qty}</span>
            )}
            <span>×</span>
            {editingHere(i, 'unit_price') ? (
              cellInput('Edit unit price', true)
            ) : editable ? (
              <button type="button" className={editBtn}
                onClick={() => start(i, 'unit_price', String(li.unit_price))} aria-label={`Edit unit price: ${money(Number(li.unit_price))}`}>
                {money(Number(li.unit_price))}
              </button>
            ) : (
              <span>{money(Number(li.unit_price))}</span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
