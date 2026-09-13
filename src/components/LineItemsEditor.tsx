'use client';
// Shared line-item list with inline editing of description, quantity, and unit
// price — used by the chat confirmation card and the draft invoice detail page,
// so the edit interaction can't drift between them. Tap a value to edit it;
// blur or Enter commits, Escape cancels. The component never persists: it emits
// the new items via onChange and the parent decides what to do (a draft in
// React state, or a DB write with recomputed totals). Amounts are validated
// here — non-negative, bounded, snapped to two decimals.
import { useState } from 'react';
import Icon from '@/components/Icon';
import { money, calculateLineAmount } from '@/lib/financials';

export interface EditableLineItem {
  description: string;
  qty: number;
  unit_price: number;
  // Preserved through edits (item 3 training signal); this component never sets it.
  original_description?: string | null;
}

type Field = 'description' | 'qty' | 'unit_price';

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
      if (t === cur.description) return; // unchanged — no-op
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

  function move(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const temp = next[i];
    next[i] = next[target];
    next[target] = temp;
    onChange(next);
  }

  function duplicate(i: number) {
    const item = items[i];
    if (!item) return;
    const next = [...items];
    next.splice(i + 1, 0, { ...item });
    onChange(next);
  }

  function remove(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next);
  }

  function addLineItem() {
    const newIndex = items.length;
    const newItem: EditableLineItem = { description: '', qty: 1, unit_price: 0 };
    onChange([...items, newItem]);
    start(newIndex, 'description', '');
  }

  const editingHere = (i: number, f: Field) => editable && cell?.i === i && cell.f === f;

  function cellInput(aria: string, numeric: boolean) {
    return (
      <input
        autoFocus
        className={`rounded-md border border-primary/50 bg-surface-container-lowest px-2 py-1 text-on-background outline-none focus:border-primary ${
          numeric ? 'w-24 text-right' : 'min-w-0 flex-1 text-body-md'
        }`}
        value={text}
        inputMode={numeric ? 'decimal' : 'text'}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setCell(null);
          }
        }}
        aria-label={aria}
      />
    );
  }

  const editBtnStyle =
    'inline-flex items-center gap-1 underline decoration-dotted decoration-outline-variant/60 underline-offset-4 transition active:opacity-60 text-left min-h-[44px] py-1';

  return (
    <div className="space-y-3">
      {items.map((li, i) => (
        <div key={i} className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest/50 p-2.5 text-body-md">
          {/* Main row: Line number + Description + Amount */}
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 font-mono text-sm font-semibold text-on-surface-variant/80">
              {i + 1}.
            </span>

            {editingHere(i, 'description') ? (
              cellInput('Edit line item description', false)
            ) : editable ? (
              <button
                type="button"
                className={`min-w-0 flex-1 ${editBtnStyle}`}
                onClick={() => start(i, 'description', li.description)}
                aria-label={`Edit description: ${li.description || 'empty'}`}
              >
                <span className="truncate">{li.description || <span className="italic text-on-surface-variant/50">Empty description</span>}</span>
                <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate">{li.description}</span>
            )}

            <span className="shrink-0 font-display font-bold pl-1">
              {money(calculateLineAmount(li.qty, li.unit_price))}
            </span>
          </div>

          {/* Sub-row: Qty x Unit price */}
          <div className="mt-0.5 flex items-center gap-1.5 pl-5 text-sm text-on-surface-variant">
            {editingHere(i, 'qty') ? (
              cellInput('Edit quantity', true)
            ) : editable ? (
              <button
                type="button"
                className={editBtnStyle}
                onClick={() => start(i, 'qty', String(li.qty))}
                aria-label={`Edit quantity: ${li.qty}`}
              >
                <span>{li.qty}</span>
                <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : (
              <span>{li.qty}</span>
            )}

            <span className="text-on-surface-variant/60">×</span>

            {editingHere(i, 'unit_price') ? (
              cellInput('Edit unit price', true)
            ) : editable ? (
              <button
                type="button"
                className={editBtnStyle}
                onClick={() => start(i, 'unit_price', String(li.unit_price))}
                aria-label={`Edit unit price: ${money(li.unit_price)}`}
              >
                <span>{money(li.unit_price)}</span>
                <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant/70" />
              </button>
            ) : (
              <span>{money(li.unit_price)}</span>
            )}
          </div>

          {/* Control row: Up, Down, Dup, Delete */}
          {editable && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5 border-t border-outline-variant/15 pt-2">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:bg-surface-container"
                aria-label={`Move line ${i + 1} up`}
              >
                Up
              </button>

              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:bg-surface-container"
                aria-label={`Move line ${i + 1} down`}
              >
                Down
              </button>

              <button
                type="button"
                onClick={() => duplicate(i)}
                className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-surface-container-high font-medium text-xs text-on-surface transition active:scale-95"
                aria-label={`Duplicate line ${i + 1}`}
              >
                Dup
              </button>

              <button
                type="button"
                onClick={() => remove(i)}
                className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md bg-error/10 text-error font-semibold text-xs transition active:scale-95 hover:bg-error/20"
                aria-label={`Delete line ${i + 1}`}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add line item button */}
      {editable && (
        <button
          type="button"
          onClick={addLineItem}
          className="w-full min-h-[44px] rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest/30 py-2.5 px-4 text-sm font-semibold text-primary transition hover:bg-primary/5 active:scale-[0.99] flex items-center justify-center gap-1.5"
        >
          <Icon name="add" size={18} />
          <span>Add line item</span>
        </button>
      )}
    </div>
  );
}
