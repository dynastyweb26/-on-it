// Stripe account problems → at most ONE push per user per Stripe event.
// The flips come from lib/stripe/connect.ts (atomic true→false compare-and-set,
// or the account being cleared), so each problem already has a single winner
// across duplicate deliveries; notify() adds the notification_log claim.
//
// Several flags can drop in one event (e.g. requirements come due: details and
// payouts together). Only the most urgent is sent:
//   disconnected > charges_paused > details_needed > payouts_paused
// Never throws.
import 'server-only';
import { notify, type ConnectProblem } from './index';
import type { ConnectFlagOff } from '@/lib/stripe/connect';

const PRIORITY: ConnectProblem[] = ['disconnected', 'charges_paused', 'details_needed', 'payouts_paused'];

export async function notifyConnectProblems(
  problems: Array<ConnectFlagOff | { userId: string; problem: 'disconnected' }>,
  sourceEventId: string,
): Promise<number> {
  const byUser = new Map<string, ConnectProblem>();
  for (const { userId, problem } of problems) {
    const current = byUser.get(userId);
    if (!current || PRIORITY.indexOf(problem) < PRIORITY.indexOf(current)) byUser.set(userId, problem);
  }
  let delivered = 0;
  for (const [userId, problem] of byUser) {
    delivered += await notify(userId, { type: 'connect_problem', problem, sourceEventId });
  }
  return delivered;
}
