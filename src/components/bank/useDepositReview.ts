'use client';
// How many deposits are still waiting in To review. The stack owns the writes,
// so it fires 'onit:deposits-changed' after a decision and this refetches; the
// count is always the route's word, never a local guess.
import { useEffect, useState } from 'react';
import { DEPOSITS_URL, depositPlan } from '@/lib/bank-deposits';

export const DEPOSITS_CHANGED = 'onit:deposits-changed';

export default function useDepositReview(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(DEPOSITS_URL, { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as unknown;
        const plan = depositPlan(res.status, body);
        if (!live || plan.kind !== 'rows') return;
        setCount(plan.deposits.filter((deposit) => !deposit.accounted).length);
      } catch {
        // Offline or gated: the tiles simply show no badge.
      }
    };
    void load();
    const again = () => void load();
    window.addEventListener(DEPOSITS_CHANGED, again);
    return () => { live = false; window.removeEventListener(DEPOSITS_CHANGED, again); };
  }, [enabled]);

  return count;
}
