'use client';
// The compact "logged" card a saved expense collapses into (MOTION-SPEC §8,
// board "05 · Receipt capture"): thumbnail, store, category · date, amount,
// and the LOGGED chip. A real chat message, so it stays in the thread.
//
// Live save (animate): the card arrives as the expense card folds away, the
// amount counts up over 500ms (CountUpMoney), and the LOGGED chip springs in
// 200ms after it lands. Restored messages render static. Reduced motion:
// CountUpMoney shows the final figure and the global rule stops the rest.
import Icon from '@/components/Icon';
import CountUpMoney from '@/components/CountUpMoney';

export type LoggedExpense = {
  amount: number;
  vendor: string | null;
  category: string;      // display label, e.g. "Supplies"
  date: string;          // yyyy-mm-dd
  thumb?: string | null; // the receipt bubble's data URL, when there was a photo
};

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const COUNT_MS = 500;
const CHIP_AFTER_MS = 200;
const ENTER_MS = 240; // onit-logged-in

export default function LoggedExpenseCard({ e, animate = false }: { e: LoggedExpense; animate?: boolean }) {
  return (
    <div className={`card flex items-center gap-3 p-3${animate ? ' onit-logged-in' : ''}`}>
      {e.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.thumb} alt="" className="h-12 w-12 shrink-0 rounded-input border border-outline-variant/40 object-cover" />
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-input bg-surface-container text-on-surface-variant">
          <Icon name="receipt_long" size={22} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-on-background">{e.vendor || e.category}</div>
        <div className="truncate text-xs text-on-surface-variant">{e.category} · {shortDate(e.date)}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="font-display text-lg font-bold tabular-nums text-on-background">
          <CountUpMoney value={e.amount} run={animate} format={money} delayMs={ENTER_MS} durationMs={COUNT_MS} />
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-paid-container px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-paid${animate ? ' onit-chip-in' : ''}`}
          style={animate ? { animationDelay: `${ENTER_MS + COUNT_MS + CHIP_AFTER_MS}ms` } : undefined}
        >
          <Icon name="check_circle" size={14} filled /> Logged
        </span>
      </div>
    </div>
  );
}
