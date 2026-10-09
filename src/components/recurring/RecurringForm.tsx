'use client';
// New / Edit recurring expense (release frame 3i; UI-REDESIGN-AUDIT §1.13,
// merge 3 · 3·2). Cancel · title · Save (disabled until vendor + amount and a
// change). Vendor, Amount, Category › (the 10 expense categories, Q5); How
// often Weekly · Monthly · Yearly; Next charge (today or later — a past date
// would back-fill); Log automatically (off = paused: listed and projected,
// never logged; back on → the next due date from today, no back-fill, L15).
// anchor_day follows Next charge for monthly / yearly. Edit adds Stop &
// delete (soft; expenses already logged stay, L3). last_* are the cron's.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import SegmentedControl from '@/components/SegmentedControl';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { CATEGORY_LABEL, EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses';
import {
  CADENCE_LABEL, RECURRING_PATH, VENDOR_MAX, anchorFor, firstDueFrom, localToday, longDay, parseAmount,
  type Cadence, type Recurring,
} from '@/lib/recurring';

const SAVED_MS = 380; // the ✓ shows this long before the screen moves on (2·14)

export default function RecurringForm({ mode, item }: { mode: 'new' | 'edit'; item?: Recurring }) {
  const supabase = createClient();
  const router = useRouter();
  const today = localToday();
  const start = useRef({
    vendor: item?.vendor ?? '',
    amount: item ? money(item.amount) : '',
    category: (item?.category ?? 'other') as ExpenseCategory,
    cadence: (item?.cadence ?? 'monthly') as Cadence,
    next_on: item?.next_on ?? today,
    auto_log: item?.auto_log ?? true,
  });
  const [vendor, setVendor] = useState(start.current.vendor);
  const [amount, setAmount] = useState(start.current.amount);
  const [category, setCategory] = useState<ExpenseCategory>(start.current.category);
  const [cadence, setCadence] = useState<Cadence>(start.current.cadence);
  const [nextOn, setNextOn] = useState(start.current.next_on);
  const [autoLog, setAutoLog] = useState(start.current.auto_log);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const parsed = parseAmount(amount);
  const s = start.current;
  const dirty = mode === 'new' || vendor.trim() !== s.vendor.trim() || parsed !== (item?.amount ?? null)
    || category !== s.category || cadence !== s.cadence || nextOn !== s.next_on || autoLog !== s.auto_log;
  const canSave = vendor.trim().length > 0 && amount.trim().length > 0 && dirty && !busy && !done;
  const close = () => (window.history.length > 1 ? router.back() : router.replace(RECURRING_PATH));
  const clear = () => setError('');

  async function save() {
    if (!canSave) return;
    if (parsed == null || Number.isNaN(parsed)) { setError('Enter an amount like 54.99.'); amountRef.current?.focus(); return; }
    // A new or moved charge date can't be in the past: the cron would back-fill it.
    if (nextOn !== s.next_on || mode === 'new') {
      if (!nextOn || nextOn < today) { setError('Pick today or a later date for the next charge.'); return; }
    }
    // Turning Log automatically back on starts from the next due date (no back-fill).
    const resumed = mode === 'edit' && autoLog && !s.auto_log;
    const next_on = resumed ? firstDueFrom(nextOn, cadence, anchorFor(cadence, nextOn), today) : nextOn;
    const fields = {
      vendor: vendor.trim(), amount: parsed, category, cadence,
      anchor_day: anchorFor(cadence, next_on), next_on, auto_log: autoLog,
    };
    setBusy(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBusy(false); router.replace('/login'); return; }
    const { error: err } = mode === 'new'
      ? await supabase.from('recurring_expenses').insert({ ...fields, user_id: session.user.id })
      : await supabase.from('recurring_expenses').update(fields).eq('id', item!.id);
    setBusy(false);
    if (err) {
      setError(err.code === '23505'
        ? `You already have ${fields.vendor} as a ${CADENCE_LABEL[cadence].toLowerCase()} recurring expense.`
        : 'Couldn’t save — check your connection and try again.');
      return;
    }
    setDone(true);
    setTimeout(() => router.replace(RECURRING_PATH), SAVED_MS);
  }

  async function stop() {
    if (!item || busy) return;
    setBusy(true);
    const { error: err } = await supabase.from('recurring_expenses').update({ deleted_at: new Date().toISOString() }).eq('id', item.id);
    setBusy(false);
    if (err) { setError('Couldn’t stop it — check your connection and try again.'); return; }
    router.replace(RECURRING_PATH);
  }

  return (
    <div className="flex min-h-full flex-col px-4 pb-8">
      <div data-form-bar="" className="sticky top-0 z-[1] flex h-14 items-center justify-between border-b border-outline-variant/60 bg-background">
        <button type="button" onClick={close} className="min-h-touch px-1 text-[17px] text-primary">Cancel</button>
        <h1 className="text-[17px] font-bold text-on-background">{mode === 'new' ? 'New recurring' : 'Edit recurring'}</h1>
        <button type="button" onClick={save} disabled={!canSave} aria-label={done ? 'Saved' : undefined}
          className={`min-h-touch px-1 text-[17px] font-bold text-primary ${done ? '' : 'disabled:opacity-40'}`}>
          {done ? <Icon name="check" size={24} className="onit-pop block" /> : busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-outline-variant/60 bg-surface-container-lowest">
        <label className="block border-b border-outline-variant/50 px-4 py-2.5">
          <span className="block text-[13px] text-on-surface-variant">Vendor</span>
          <input value={vendor} maxLength={VENDOR_MAX} autoComplete="off" autoCapitalize="words" placeholder="Adobe Creative Cloud"
            onChange={(e) => { clear(); setVendor(e.target.value); }}
            className="w-full bg-transparent text-body-lg text-on-background outline-none placeholder:text-on-surface-variant/70" />
        </label>
        <label className="block border-b border-outline-variant/50 px-4 py-2.5">
          <span className="block text-[13px] text-on-surface-variant">Amount</span>
          <input ref={amountRef} value={amount} inputMode="decimal" autoComplete="off" placeholder="$0.00"
            onChange={(e) => { clear(); setAmount(e.target.value.slice(0, 16)); }}
            onBlur={() => { const n = parseAmount(amount); if (n != null && !Number.isNaN(n)) setAmount(money(n)); }}
            className="w-full bg-transparent font-display text-[24px] font-extrabold text-on-background outline-none placeholder:text-on-surface-variant/50" />
        </label>
        {/* Category ›: the native picker (a wheel on iOS) under the row. */}
        <label className="relative flex min-h-[52px] items-center justify-between px-4">
          <span className="text-body-lg text-on-background">Category</span>
          <span className="flex items-center gap-1 text-body-lg text-on-surface-variant">
            {CATEGORY_LABEL[category]} <Icon name="chevron_right" size={20} />
          </span>
          <select aria-label="Category" value={category} onChange={(e) => { clear(); setCategory(e.target.value as ExpenseCategory); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 px-1 text-[13px] text-on-surface-variant">How often</div>
      <div className="mt-1.5 [&>div]:grid [&>div]:w-full">
        <SegmentedControl label="How often" value={cadence} onChange={(c) => { clear(); setCadence(c); }}
          options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }] as const} />
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-outline-variant/60 bg-surface-container-lowest">
        <label className="relative flex min-h-[52px] items-center justify-between border-b border-outline-variant/50 px-4">
          <span className="text-body-lg text-on-background">Next charge</span>
          <span className="rounded-[10px] bg-surface-container-high px-3 py-1.5 text-[16px] text-on-background">{nextOn ? longDay(nextOn) : 'Pick a date'}</span>
          <input type="date" aria-label="Next charge" value={nextOn} min={today}
            onChange={(e) => { clear(); setNextOn(e.target.value); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-body-lg text-on-background">Log automatically</p>
            <p className="text-[13px] text-on-surface-variant">{autoLog ? 'Adds the expense to Books each time' : 'Paused — still listed, never logged'}</p>
          </div>
          <button type="button" role="switch" aria-checked={autoLog} aria-label="Log automatically"
            onClick={() => { clear(); setAutoLog((v) => !v); }}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${autoLog ? 'bg-primary-container' : 'bg-outline-variant'}`}>
            <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow transition-transform duration-[160ms] ${autoLog ? 'translate-x-6' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-input bg-error-container px-4 py-2.5 text-body-md font-semibold text-error-on-container">{error}</p>}

      {mode === 'edit' && (
        <button type="button" onClick={stop} disabled={busy}
          className="mt-auto flex h-14 w-full items-center justify-center gap-2 rounded-full border border-error/30 text-[17px] font-bold text-error transition active:scale-[0.98] disabled:opacity-40">
          <Icon name="delete" size={20} /> Stop &amp; delete
        </button>
      )}
    </div>
  );
}
