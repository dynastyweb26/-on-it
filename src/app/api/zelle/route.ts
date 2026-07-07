// GET/POST /api/zelle — the ONLY path to the encrypted Zelle column.
// Server-side only: the encryption key and the admin client never reach the
// browser. The set_zelle/get_zelle SQL functions are revoked from anon and
// authenticated roles, so even direct PostgREST calls can't touch them.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { sanitizeField } from '@/lib/sanitize';

const mask = (v: string) => (v.length <= 4 ? '••••' : `••••${v.slice(-4)}`);

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('zelle_read', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const key = process.env.ZELLE_ENC_KEY;
  if (!key) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const { data, error } = await adminClient().rpc('get_zelle', { p_user: user.id, p_key: key });
  if (error) return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  if (!data) return NextResponse.json({ set: false });

  // full=1 → the owner's own value, for rendering it on their invoices
  const full = req.nextUrl.searchParams.get('full') === '1';
  return NextResponse.json({ set: true, masked: mask(data), ...(full ? { value: data } : {}) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('zelle_write', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const key = process.env.ZELLE_ENC_KEY;
  if (!key) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const body = await req.json().catch(() => null);
  const value = sanitizeField(body?.value, 120);

  if (!value) {
    // empty value clears the stored handle
    const { error } = await adminClient()
      .from('profiles')
      .update({ zelle_info_enc: null })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
    return NextResponse.json({ set: false });
  }

  const { error } = await adminClient().rpc('set_zelle', { p_user: user.id, p_value: value, p_key: key });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ set: true, masked: mask(value) });
}
