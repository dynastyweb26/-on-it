// POST /api/bank — the ONLY write path for the bank transfer columns.
// Same shape as /api/zelle: server-side only, the encryption key and the admin
// client never reach the browser. set_bank_transfer / set_bank_transfer_enabled
// / clear_bank_transfer are revoked from PUBLIC, anon and authenticated, and
// none of the bank columns is granted to authenticated, so a direct PostgREST
// call can't skip the validation below (or the database's own checks).
//
// Body: { action: 'save', ...BankDetails } | { action: 'enable', enabled }
//     | { action: 'clear' }
// Reads need no route: the owner reads their own row (RLS), and Settings only
// shows the last four.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { sanitizeField } from '@/lib/sanitize';
import { BankDetailsSchema, firstBankError, ROUTING_ERROR, ACCOUNT_ERROR } from '@/lib/bank';

const EnableBody = z.object({ action: z.literal('enable'), enabled: z.boolean() });
const ClearBody = z.object({ action: z.literal('clear') });

const STATE_COLS = 'bank_holder_name, bank_name, bank_routing, bank_account_last4, bank_account_type, bank_transfer_enabled';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('bank_write', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 });
  }
  const key = process.env.ZELLE_ENC_KEY;
  if (!key) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const admin = adminClient();

  // The pro's current saved state (owner read through RLS).
  const current = async () =>
    (await supabase.from('profiles').select(STATE_COLS).eq('id', user.id).maybeSingle()).data;

  if (ClearBody.safeParse(body).success) {
    const { error } = await admin.rpc('clear_bank_transfer', { p_user: user.id });
    if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
    return NextResponse.json({ bank: await current() });
  }

  const enable = EnableBody.safeParse(body);
  if (enable.success) {
    const { error } = await admin.rpc('set_bank_transfer_enabled', { p_user: user.id, p_enabled: enable.data.enabled });
    if (error) {
      // profiles_bank_enabled_complete: something is missing.
      if (error.code === '23514') return NextResponse.json({ error: 'Fill in every bank field before turning this on.' }, { status: 400 });
      return NextResponse.json({ error: 'save failed' }, { status: 500 });
    }
    return NextResponse.json({ bank: await current() });
  }

  if (body?.action !== 'save') return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const parsed = BankDetailsSchema.safeParse({
    holderName: sanitizeField(body.holderName, 100),
    bankName: sanitizeField(body.bankName, 100),
    routing: typeof body.routing === 'string' ? body.routing : '',
    account: typeof body.account === 'string' && body.account.trim() ? body.account : undefined,
    accountConfirm: typeof body.accountConfirm === 'string' ? body.accountConfirm : undefined,
    accountType: body.accountType,
    enabled: body.enabled === true,
  });
  if (!parsed.success) return NextResponse.json({ error: firstBankError(parsed) }, { status: 400 });
  const d = parsed.data;

  // Keeping the stored account is only possible when one is stored.
  if (d.account === undefined && !(await current())?.bank_account_last4) {
    return NextResponse.json({ error: 'Enter your account number.' }, { status: 400 });
  }

  const { error } = await admin.rpc('set_bank_transfer', {
    p_user: user.id,
    p_holder: d.holderName,
    p_bank: d.bankName,
    p_routing: d.routing,
    p_account: d.account ?? null,
    p_type: d.accountType,
    p_enabled: d.enabled,
    p_key: key,
  });
  if (error) {
    if (error.code === '22023') return NextResponse.json({ error: ACCOUNT_ERROR }, { status: 400 });
    if (error.code === '23514') {
      const msg = error.message.includes('routing') ? ROUTING_ERROR : 'Check the bank details.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
  return NextResponse.json({ bank: await current() });
}
