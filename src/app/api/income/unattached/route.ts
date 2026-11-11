// POST /api/income/unattached — record a payment with no invoice behind it.
//
// This is money in that no invoice explains. It is stored in other_income with
// classification 'other_income', which is the row Books, Summary and the Income
// list already sum. No invoice is read or written, and no invoice status moves.
//
// Ownership and permission come from the session and RLS only: the call runs on
// the user's own client, the policies allow only the owner's manual rows, and
// user_id is taken from the session — never from the body. No service role.
//
// Body: { amount, method, received_on, title?, idempotency_key? }
//   amount          positive, 2 decimals
//   method          one of the card's methods
//   received_on     yyyy-mm-dd, the day the money arrived
//   title           optional name the owner typed; a neutral one fills a blank
//   idempotency_key optional; the card mints one per submission and reuses it
//                   for every retry, so a retry writes one row
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import {
  isDifferentUnattachedPayment,
  isUnattachedIdempotencyConflict,
  parseUnattachedPayment,
  saveUnattachedPaymentOnce,
  unattachedInsertRow,
  unattachedPaymentKey,
  type UnattachedPaymentIO,
  type UnattachedPaymentRow,
} from '@/lib/unattached-payment';

export const runtime = 'nodejs';

const Body = z.object({
  amount: z.union([z.number(), z.string()]),
  method: z.string(),
  received_on: z.string(),
  title: z.string().nullish(),
  idempotency_key: z.string().min(1).max(120).optional(),
});

const fail = (code: string, status = 400) => NextResponse.json({ error: code }, { status });

/** The error code a failed save carries, whichever layer produced it. */
const codeOf = (error: unknown): string =>
  error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : '';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized', 401);
  if (!(await rateLimit('income-unattached', rateIdentifier(req, user.id)))) {
    return fail('rate_limited', 429);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('invalid_request');

  const input = parseUnattachedPayment(parsed.data);
  if (!input.ok) return fail(input.code);

  const key = parsed.data.idempotency_key ?? unattachedPaymentKey();
  const row = unattachedInsertRow(user.id, input.value, key);

  /** The original for this key, if it exists and the owner may read it. */
  const findByKey = async (userId: string, k: string): Promise<UnattachedPaymentRow | null> => {
    const { data, error } = await supabase
      .from('other_income')
      .select('id, amount, received_on, method, idempotency_key')
      .eq('user_id', userId)
      .eq('idempotency_key', k)
      .maybeSingle();
    if (error) {
      console.error('[income/unattached] read-back failed', error.code);
      return null;
    }
    return (data as UnattachedPaymentRow | null) ?? null;
  };

  const io: UnattachedPaymentIO = {
    insertOnce: async (pending) => {
      // A plain insert, never an upsert: the rule is a PARTIAL unique index
      // (key is not null), which PostgREST cannot address with ON CONFLICT. A
      // repeat arrives here as 23505 on that index instead.
      const { error } = await supabase.from('other_income').insert(pending);
      if (!error) return { error: null };
      if (!isUnattachedIdempotencyConflict(error)) return { error };

      // The key is already spent. It is this submission only if the row it
      // produced is the same money.
      const existing = await findByKey(pending.user_id, pending.idempotency_key);
      if (!existing) {
        // Recorded, but not readable for this key: never report success on a
        // reason we cannot see, and never blame the user for it.
        return {
          error: {
            status: 500,
            code: 'PAYMENT_READBACK_MISSING',
            message: 'payment exists for key but could not be read back',
          },
          fatal: true,
        };
      }
      if (isDifferentUnattachedPayment(existing, pending)) {
        return {
          error: {
            status: 409,
            code: 'PAYMENT_KEY_REUSED',
            message: 'idempotency key already recorded a different payment',
          },
          fatal: true,
        };
      }
      return { error: null };
    },
    findByKey,
  };

  const saved = await saveUnattachedPaymentOnce(io, row);
  if (!saved.ok) {
    const code = codeOf(saved.error);
    console.error('[income/unattached] insert failed', code || saved.error);
    if (code === '23514') return fail('invalid_request');
    // RLS refused it: a deposit-linked row, another owner's id, or a non-income
    // classification. Nothing the user can fix by retrying the same body.
    if (code === '42501') return fail('not_allowed', 403);
    if (code === 'PAYMENT_KEY_REUSED') return fail('duplicate_submission', 409);
    if (code === 'PAYMENT_READBACK_MISSING') return fail('db_insert_failed', 500);
    return fail('db_insert_failed', 500);
  }

  return NextResponse.json({ ok: true, id: saved.payment.id });
}
