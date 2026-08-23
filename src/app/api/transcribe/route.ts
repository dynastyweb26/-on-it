// POST /api/transcribe — voice input via AssemblyAI.
// Receives an audio blob, returns { text }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier, reserveGuestDaily, reserveUserDaily } from '@/lib/ratelimit';

const AAI = 'https://api.assemblyai.com/v2';

// Deferred-auth guest budget for the voice demo. Trying voice before signup is
// intentional, so we cap rather than block: a small per-browser allowance
// (cookie, mirrors /api/parse's onit_guest counter) plus a global daily ceiling
// in reserveGuestDaily() that IP rotation + fresh cookies can't slip past.
// A handful of taps is plenty to feel the flow before creating an account; the
// global daily ceiling in reserveGuestDaily() is the real cost backstop.
const GUEST_TX_LIMIT = 6;
const GUEST_TX_COOKIE = 'onit_guest_tx'; // separate from parse's onit_guest so
                                         // the two demos don't drain each other

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Guests and anon callers hit this too (voice is open pre-signup), so limit
  // by user-or-IP — previously anonymous callers had NO limit on AssemblyAI.
  if (!(await rateLimit('transcribe', rateIdentifier(req, user?.id)))) {
    return NextResponse.json(
      { error: 'rate limited', message: 'One sec — slow down a moment.' },
      { status: 429 }
    );
  }

  // Validate the blob before spending anything — cheap, no AssemblyAI cost.
  const audio = await req.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'invalid audio' }, { status: 400 });
  }

  // Deferred auth: unauthenticated callers get a few free transcriptions before
  // we ask them to sign up. Two backstops, both guest-only — signed-in users
  // keep the existing rate limits and nothing else:
  if (!user) {
    // 1. Per-browser quota via httpOnly cookie counter (same shape as /api/parse).
    const guestCount = Number(req.cookies.get(GUEST_TX_COOKIE)?.value ?? 0);
    if (guestCount >= GUEST_TX_LIMIT) {
      return NextResponse.json(
        {
          authRequired: true,
          message: "That's the free voice previews used up — create your free account to keep talking to On It.",
        },
        { status: 401 }
      );
    }

    // 2. Global daily ceiling across ALL guests, so cookie-clearing + rotating
    //    IPs still hit one wall. Reserve right before the paid work; signing up
    //    lifts the guest ceiling, so we point there too.
    if (!(await reserveGuestDaily('transcribe'))) {
      return NextResponse.json(
        {
          authRequired: true,
          message: "Voice is busy today — create your free account to keep using it. It's instant.",
        },
        { status: 429 }
      );
    }
  } else {
    // Signed-in daily ceiling. The per-minute window above caps burst rate;
    // this caps one account's total daily AssemblyAI + downstream Anthropic
    // spend — the backstop that used to be implicit in tier gating, now that
    // the paywall is off and nothing gates on tier. Reserved right before the
    // paid work; fails open on a Redis outage.
    if (!(await reserveUserDaily('transcribe', user.id))) {
      return NextResponse.json(
        { error: 'daily limit', message: "That's today's voice limit — it resets tomorrow. You can type in the meantime." },
        { status: 429 }
      );
    }
  }

  const headers = { authorization: process.env.ASSEMBLYAI_API_KEY! };

  // 1. Upload
  const up = await fetch(`${AAI}/upload`, { method: 'POST', headers, body: audio });
  const { upload_url } = await up.json();

  // 2. Request transcript
  const tr = await fetch(`${AAI}/transcript`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, language_detection: true }),
  });
  const { id } = await tr.json();

  // 3. Poll (voice notes are short; this stays well under function limits)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(`${AAI}/transcript/${id}`, { headers });
    const data = await poll.json();
    if (data.status === 'completed') {
      const res = NextResponse.json({ text: data.text ?? '' });
      // Count only delivered transcriptions against the guest's browser quota —
      // a failed take shouldn't burn a free preview. (The global daily counter
      // above already reserved on attempt; that one is deliberately stricter.)
      if (!user) {
        const guestCount = Number(req.cookies.get(GUEST_TX_COOKIE)?.value ?? 0);
        res.cookies.set(GUEST_TX_COOKIE, String(guestCount + 1), { httpOnly: true, sameSite: 'lax' });
      }
      return res;
    }
    if (data.status === 'error') break;
  }
  return NextResponse.json({ error: 'transcription failed' }, { status: 500 });
}
