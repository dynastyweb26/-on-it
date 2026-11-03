'use client';
// ═══ Expenses | Income — one pair, two pages ═══
// Same component pattern as Clients | Products: a large pill, a title that
// changes with it, and the left page first. Here the two pages can also be
// swiped, with a rubber band at either end.
//
// The left 24px edge wins over the pager, exactly as it does for the tab deck:
// a drag that starts there goes back to Books instead of changing page.
//
// Both pages stay mounted so a swipe is a move, not a reload; each owns its own
// data and its own sheets. The + button lives in this header and asks the page
// on screen to open its form.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import PillTabs from '@/components/PillTabs';
import ExpensesPane from './ExpensesPane';
import IncomePane from '@/components/income/IncomePane';
import { useBankTracking } from '@/components/bank/BankTrackingProvider';
import { unaccountedItems } from '@/lib/bank-tracking';
import { applyEdgeResistance, classifyAxis } from '@/lib/swipe';
import { DEPOSITS_URL, depositPlan } from '@/lib/bank-deposits';

type Side = 'expenses' | 'income';

/** The system back-swipe strip; inside the pair it goes back to Books. */
const EDGE_BACK_PX = 24;
const COMMIT_PX = 70;

export default function LedgerPair({ initial }: { initial: Side }) {
  const router = useRouter();
  const bank = useBankTracking();
  const [side, setSide] = useState<Side>(initial);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [depositsToReview, setDepositsToReview] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const dragRef = useRef(0);
  const gesture = useRef<{ id: number; x: number; y: number; active: boolean; edge: boolean } | null>(null);

  const index = side === 'expenses' ? 0 : 1;
  const expenseCount = bank?.state ? unaccountedItems(bank.state).length : 0;

  // The Income page's to-review count is undecided deposits.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(DEPOSITS_URL, { cache: 'no-store' });
        const plan = depositPlan(res.status, (await res.json().catch(() => null)) as unknown);
        if (!live || plan.kind !== 'rows') return;
        setDepositsToReview(plan.deposits.filter((deposit) => !deposit.accounted).length);
      } catch { /* offline: no badge */ }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const measure = () => { widthRef.current = rootRef.current?.getBoundingClientRect().width ?? 0; };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /** The pill and a committed swipe both land here. The URL follows without a
   *  history entry, so Back leaves the pair instead of walking its pages. */
  const go = useCallback((next: Side) => {
    if (next === side) return;
    setSide(next);
    try { window.history.replaceState(null, '', next === 'expenses' ? '/expenses' : '/income'); } catch { /* ignore */ }
  }, [side]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: false,
      edge: e.clientX <= EDGE_BACK_PX,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // The edge wins: a rightward drag from the left strip is Back to Books.
    if (g.edge) {
      if (dx > 60 && Math.abs(dx) > Math.abs(dy)) {
        gesture.current = null;
        dragRef.current = 0;
        setDrag(0);
        router.push('/dashboard');
      }
      return;
    }
    if (!g.active) {
      if (Math.abs(dx) < 10) return;
      if (classifyAxis(dx, dy) !== 'horizontal') { if (Math.abs(dy) > Math.abs(dx)) gesture.current = null; return; }
      g.active = true;
      setDragging(true);
    }
    const width = widthRef.current || 1;
    dragRef.current = applyEdgeResistance(dx, index, 2, width);
    setDrag(dragRef.current);
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.active) { setDrag(0); dragRef.current = 0; return; }
    setDragging(false);
    const dx = dragRef.current;
    dragRef.current = 0;
    setDrag(0);
    if (Math.abs(dx) >= COMMIT_PX) {
      const next = dx < 0 ? 'income' : 'expenses';
      if (next !== side) go(next);
    }
  }

  const options = [
    { value: 'expenses' as const, label: `Expenses${expenseCount > 0 ? ` ${expenseCount}` : ''}` },
    { value: 'income' as const, label: `Income${depositsToReview > 0 ? ` ${depositsToReview}` : ''}` },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-4 pt-2 md:px-6">
      <div className="flex items-center justify-between px-1 pb-2.5">
        <h1 key={side} className="ledger-title font-display text-[28px] font-extrabold leading-tight">
          {side === 'expenses' ? 'Expenses' : 'Income'}
        </h1>
        <button
          type="button"
          aria-label={side === 'expenses' ? 'Add expense' : 'Add income'}
          onClick={() => window.dispatchEvent(new Event(side === 'expenses' ? 'onit:add-expense' : 'onit:add-income'))}
          className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-on-background active:scale-90"
        >
          <Icon name="add" size={24} />
        </button>
      </div>

      <PillTabs label="Expenses or income" options={options} value={side} onChange={go} />

      <div
        ref={rootRef}
        className="relative mt-3 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flex items-start"
          style={{
            width: '200%',
            transform: `translate3d(calc(${-index * 50}% + ${drag}px), 0, 0)`,
            transition: dragging ? 'none' : 'transform 340ms var(--ease-emphasized)',
          }}
        >
          <div className="w-1/2 shrink-0">
            <ExpensesPane chrome={false} />
          </div>
          <div className="w-1/2 shrink-0">
            <IncomePane chrome={false} active={side === 'income'} />
          </div>
        </div>
      </div>
    </div>
  );
}
