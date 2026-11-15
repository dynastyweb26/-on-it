// ═══ AI Smart · what both money-in tools share ═══
//
// record_payment and record_other_income take the same four words — an amount, a
// method, a day and (for a payment) a client — so the reading of those words
// lives here once. Nothing here writes, and nothing here formats a figure: the
// card's money string is composed by the tool with moneyText().
//
// The day is the owner's own: the profile timezone decides what "today" is, and
// a stored payment is that local day's midnight built IN that zone (the way
// lib/record-payment's sheet builds it), never UTC midnight.
import { PAYMENT_METHODS, methodLabel, type PaymentMethod } from '@/lib/record-payment';
import { resolveTimeZone, localYmd, zonedMidnight } from '@/lib/recap/dates';
import type { ToolContext } from './contract';

/**
 * The methods the model may name. The seven the sheet offers, plus the two
 * legacy stored values: a manual cash or check payment is recorded as 'other'
 * (lib/record-payment), so they are accepted and mapped, never rejected.
 */
export const METHOD_VALUES = [
  'card', 'bank', 'zelle', 'cashapp', 'paypal', 'venmo', 'other', 'cash', 'check',
] as const;
export type MethodInput = (typeof METHOD_VALUES)[number];

/** A method the model named, as the ledger stores it. Unstated is 'other'. */
export function modelMethod(value: MethodInput | undefined): PaymentMethod {
  if (!value) return 'other';
  if (value === 'cash' || value === 'check') return 'other';
  return value;
}

/** The label the card shows for a stored method ("Bank transfer", "Other"). */
export const methodText = (method: PaymentMethod): string => methodLabel(method);

/** A finished, sign-free money string for a card row. */
export const METHOD_OPTIONS: readonly PaymentMethod[] = PAYMENT_METHODS.map((entry) => entry.value);

/** The owner's timezone and the local calendar day it is right now. */
export async function ownerDay(
  ctx: { db: ToolContext['db']; userId: string },
): Promise<{ timezone: string; today: string }> {
  const profile = await ctx.db.select<{ timezone: string | null }>('profiles', {
    columns: 'timezone',
    eq: { id: ctx.userId },
  });
  if (profile.error) throw new Error(profile.error.message);
  const timezone = resolveTimeZone(profile.data?.[0]?.timezone);
  return { timezone, today: localYmd(timezone, new Date()) };
}

/** True when a yyyy-mm-dd is after the owner's today. Both are plain days. */
export const isFutureDay = (day: string, today: string): boolean => day > today;

/**
 * The instant a ledger row stores for a local calendar day: that day's midnight
 * in the owner's timezone, DST-safe — never UTC midnight, which would move an
 * evening payment to the wrong day on the invoice.
 */
export const storedPaidAt = (day: string, timezone: string): string =>
  zonedMidnight(day, timezone).toISOString();

/** One confirm, one key: the action's own id, so a replay cannot write again. */
export const actionKey = (actionId: string): string => `ai-${actionId}`;
