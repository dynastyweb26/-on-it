// POST /api/pay/[token]/bank — "Show account number" on the public pay page.
//
// The pay page model carries the bank account masked to its last 4
// (pageBank); this is the only path that returns the full number. Public and
// unauthenticated (the bearer token is the authorization, as for the page
// itself), so rate limited per IP and per token (pay_bank_ip /
// pay_bank_token). Service role, same RPCs as the page: get_public_invoice for
// the gate inputs, get_public_invoice_bank for the details (SQL-gated on
// kind='invoice', sent/overdue, unpaid, not deleted, bank transfer on), then
// the same app-side publicBank check. Anything else is a 404 that looks the
// same as a bad token. Logic in revealBankAccount (src/lib/pay-bank.ts).
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { revealBankAccount, type PublicBankRow, type PublicInvoiceGateRow } from '@/lib/pay-bank';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  // p_key decrypts Zelle inside get_public_invoice; it never leaves the server.
  const key = process.env.ZELLE_ENC_KEY ?? '';
  const admin = adminClient();
  const res = await revealBankAccount(params.token, clientIp(req), {
    limit: (bucket, id) => rateLimit(bucket === 'ip' ? 'pay_bank_ip' : 'pay_bank_token', id),
    invoice: async (token) => {
      const { data, error } = await admin.rpc('get_public_invoice', { p_token: token, p_key: key });
      if (error) {
        console.error('get_public_invoice failed', error.message);
        throw error;
      }
      return ((data as PublicInvoiceGateRow[] | null) ?? [])[0] ?? null;
    },
    bank: async (token) => {
      const { data, error } = await admin.rpc('get_public_invoice_bank', { p_token: token, p_key: key });
      if (error) {
        console.error('get_public_invoice_bank failed', error.message);
        throw error;
      }
      return ((data as PublicBankRow[] | null) ?? [])[0] ?? null;
    },
  });
  return NextResponse.json(res.body, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
}
