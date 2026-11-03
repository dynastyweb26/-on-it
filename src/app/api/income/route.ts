// POST   /api/income — add a hand-typed other_income row
// PATCH  /api/income — edit one
// DELETE /api/income — soft delete one (deleted_at, never a row removal)
//
// Income the owner types is money with no invoice behind it: Other income, which
// counts in Collected (other_income.classification = 'other_income'). A row that
// came from a bank deposit keeps its own classification and its deposit_id; the
// route never overwrites either, so editing cannot turn a deposit's decision into
// a hand-typed one or detach it from the deposit.
//
// Ownership: user_id always comes from the session, never from the body, and
// every read and write carries .eq('user_id', user.id). Service role + rate limit
// because the table has no client write policy at all.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { incomeInsertRow, incomeWriteRefusal, parseIncomeInput } from '@/lib/income-form';

export const runtime = 'nodejs';

const SOURCE = 'income';

const Fields = {
  amount: z.union([z.number(), z.string()]).optional(),
  title: z.string().optional(),
  client_name: z.string().nullish(),
  received_on: z.string().optional(),
  note: z.string().nullish(),
};

const CreateBody = z.object(Fields);
const EditBody = z.object({ ...Fields, id: z.string().uuid() });
const DeleteBody = z.object({ id: z.string().uuid() });

type Row = {
  id: string;
  amount: string | number;
  title: string | null;
  client_name: string | null;
  received_on: string;
  note: string | null;
  deposit_id: string | null;
  classification: string | null;
  deleted_at: string | null;
};

const fail = (code: string, status = 400) =>
  NextResponse.json({ error: code }, { status });

/** The preview gate is not used here: income is a real feature in every build. */
async function owner(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, limited: false } as const;
  const allowed = await rateLimit('income', rateIdentifier(req, user.id));
  return { user, limited: !allowed } as const;
}

/** One row, read by id AND owner: another owner's row is simply not found. */
async function rowFor(admin: ReturnType<typeof adminClient>, userId: string, id: string) {
  const { data, error } = await admin
    .from('other_income')
    .select('id, amount, title, client_name, received_on, note, deposit_id, classification, deleted_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { row: null, error: error.code } as const;
  return { row: (data as unknown as Row | null) ?? null, error: null } as const;
}

export async function POST(req: NextRequest) {
  const { user, limited } = await owner(req);
  if (!user) return fail('unauthorized', 401);
  if (limited) return fail('rate_limited', 429);

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('invalid_request');

  const input = parseIncomeInput(parsed.data);
  if (!input.ok) return fail(input.code);

  const admin = adminClient();
  const { data, error } = await admin
    .from('other_income')
    .insert(incomeInsertRow(user.id, input.value))
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23514') return fail('invalid_request');
    return fail('db_insert_failed', 500);
  }
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}

export async function PATCH(req: NextRequest) {
  const { user, limited } = await owner(req);
  if (!user) return fail('unauthorized', 401);
  if (limited) return fail('rate_limited', 429);

  const parsed = EditBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('invalid_request');

  const admin = adminClient();
  const found = await rowFor(admin, user.id, parsed.data.id);
  if (found.error) return fail('db_read_failed', 500);
  if (!found.row || found.row.deleted_at) return fail('not_found', 404);
  if (incomeWriteRefusal(found.row, 'edit', parsed.data)) return fail('from_deposit', 409);

  // Merge onto the stored row: an edit sends only what it changed, and the
  // deposit's classification and link are carried through untouched.
  const merged = parseIncomeInput({
    amount: parsed.data.amount ?? found.row.amount,
    title: parsed.data.title ?? found.row.title ?? '',
    client_name: parsed.data.client_name === undefined ? found.row.client_name : parsed.data.client_name,
    received_on: parsed.data.received_on ?? found.row.received_on,
    note: parsed.data.note === undefined ? found.row.note : parsed.data.note,
  });
  if (!merged.ok) return fail(merged.code);

  const { error } = await admin
    .from('other_income')
    .update({
      amount: merged.value.amount,
      title: merged.value.title,
      client_name: merged.value.client_name,
      received_on: merged.value.received_on,
      note: merged.value.note,
    })
    .eq('id', found.row.id)
    .eq('user_id', user.id);
  if (error) {
    if (error.code === '23514') return fail('invalid_request');
    return fail('db_update_failed', 500);
  }
  return NextResponse.json({ ok: true, id: found.row.id });
}

export async function DELETE(req: NextRequest) {
  const { user, limited } = await owner(req);
  if (!user) return fail('unauthorized', 401);
  if (limited) return fail('rate_limited', 429);

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('invalid_request');

  const admin = adminClient();
  const found = await rowFor(admin, user.id, parsed.data.id);
  if (found.error) return fail('db_read_failed', 500);
  if (!found.row || found.row.deleted_at) return fail('not_found', 404);
  // A deposit's row is the deposit's decision: undo it in Bank activity.
  if (incomeWriteRefusal(found.row, 'delete')) return fail('from_deposit', 409);

  // Soft delete only: the row stops counting in Collected and can be restored
  // by a later write, but nothing is ever removed from the ledger.
  const { error } = await admin
    .from('other_income')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', found.row.id)
    .eq('user_id', user.id);
  if (error) return fail('db_update_failed', 500);
  return NextResponse.json({ ok: true, id: found.row.id });
}
