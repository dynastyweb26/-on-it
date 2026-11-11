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
  isUnattachedIdempotencyConflict,
  parseUnattachedPayment,
  unattachedInsertRow,
  unattachedPaymentKey,
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
  const { data, error } = await supabase
    .from('other_income')
    .insert(unattachedInsertRow(user.id, input.value, key))
    .select('id')
    .maybeSingle();

  if (error) {
    if (isUnattachedIdempotencyConflict(error)) return fail('duplicate_submission', 409);
    console.error('[income/unattached] insert failed', error.code);
    if (error.code === '23514') return fail('invalid_request');
    // RLS refused it: a deposit-linked row, another owner's id, or a non-income
    // classification. Nothing the user can fix by retrying the same body.
    if (error.code === '42501') return fail('not_allowed', 403);
    return fail('db_insert_failed', 500);
  }

  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}
