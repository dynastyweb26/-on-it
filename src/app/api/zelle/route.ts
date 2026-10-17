// GET/POST /api/zelle — the ONLY path to the encrypted Zelle column.
// Server-side only: the encryption key and the admin client never reach the
// browser. The set_zelle/get_zelle SQL functions are revoked from PUBLIC,
// anon, and authenticated — only service_role may execute them, so a direct
// PostgREST /rpc/ call from any client role is rejected.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { sanitizeField } from '@/lib/sanitize';
import { zelleLast4, zelleMask } from '@/lib/zelle-mask';

const ZelleBody = z.object({ value: z.string().max(200).optional() });

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: NextRequest) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('zelle_read', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const key = process.env.ZELLE_ENC_KEY;
  if (!key) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const { data, error } = await adminClient().rpc('get_zelle', { p_user: user.id, p_key: key });
  if (error) return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  if (!data) return NextResponse.json({ set: false });

  // Backfill for a Zelle saved before profiles.zelle_last4 existed: stamp the
  // mask once (only where it's still NULL) so Settings renders from the
  // profile next time. Best-effort; the response doesn't depend on it.
  await adminClient().from('profiles').update({ zelle_last4: zelleLast4(data) })
    .eq('id', user.id).is('zelle_last4', null);

  // full=1 → the owner's own value, for rendering it on their invoices
  const full = req.nextUrl.searchParams.get('full') === '1';
  return NextResponse.json({ set: true, masked: zelleMask(data), ...(full ? { value: data } : {}) });
}

export async function POST(req: NextRequest) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('zelle_write', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const key = process.env.ZELLE_ENC_KEY;
  if (!key) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const parsed = ZelleBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const value = sanitizeField(parsed.data.value, 120);

  if (!value) {
    // Empty value clears the stored handle and its mask together. zelle_last4
    // is not client-writable, so this is a service-role write, scoped to the
    // id of the verified session user (never a request value).
    const { error } = await adminClient()
      .from('profiles')
      .update({ zelle_info_enc: null, zelle_last4: null })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
    return NextResponse.json({ set: false });
  }

  const { error } = await adminClient().rpc('set_zelle', { p_user: user.id, p_value: value, p_key: key });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ set: true, masked: zelleMask(value) });
}
