// POST /api/redeem — redeem an access code (e.g. the founder code) for the
// signed-in user.
//
// The ONLY way to redeem a code: redeem_grant_for() is service-role only
// (20261001000003) and the old client RPC redeem_grant lost client EXECUTE, so
// guessing has to come through here, rate-limited to 5 an hour per user.
// The user id comes from the session, never the body. Codes match EXACTLY —
// case-sensitive, no lowercasing; only surrounding whitespace (a stray space
// from a phone keyboard) is trimmed.
//
// A wrong, expired or used-up code all get the same answer, so the endpoint
// never reveals whether a code exists.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

const Body = z.object({ code: z.string().trim().min(3).max(40) });

const INVALID = "That code didn't work. Codes are case-sensitive, so check the capital letters.";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Sign in first.' }, { status: 401 });

  if (!(await rateLimit('redeem', rateIdentifier(req, user.id)))) {
    return NextResponse.json(
      { ok: false, message: 'Too many tries. Wait a bit and try again.' },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, message: INVALID }, { status: 400 });

  const { data, error } = await adminClient().rpc('redeem_grant_for', {
    p_user_id: user.id,
    p_token: parsed.data.code,
  });
  if (error) {
    console.error('redeem_grant_for failed', error.code ?? error.message);
    return NextResponse.json({ ok: false, message: "Couldn't check that code just now. Try again." }, { status: 500 });
  }

  switch (data as string) {
    case 'ok':
      return NextResponse.json({ ok: true, tier: 'founder', message: "You're set. Free access is on." });
    case 'already_founder':
      return NextResponse.json({ ok: false, message: 'You already have free access.' });
    case 'already_redeemed':
      return NextResponse.json({ ok: false, message: "You've already used this code." });
    case 'no_profile':
      return NextResponse.json({ ok: false, message: 'Finish setting up your account first.' });
    default:
      return NextResponse.json({ ok: false, message: INVALID });
  }
}
