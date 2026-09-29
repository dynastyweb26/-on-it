// POST   /api/push/subscribe — save this device's push subscription for the
//                              signed-in user.
// DELETE /api/push/subscribe — forget this device (toggle off, sign-out).
//
// Why a server route instead of a direct table write: push_subscriptions has
// no UPDATE policy (20260929000000), and an endpoint is unique per device. When
// a second account signs in on the same phone, the device must MOVE to them —
// a row the new user can't see or update. The service role upserts on
// endpoint and assigns it to whoever is signed in now, tagged with this
// deployment's env (preview and production share the DB and each sends only to
// its own devices). Ownership comes from the session, never the body.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { deployEnv } from '@/lib/deploy-env';

// Push services only hand out https endpoints; the caps mirror the DB checks.
const Endpoint = z.string().url().max(2048).refine((u) => u.startsWith('https://'));
const SubscribeBody = z.object({
  endpoint: Endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});
const UnsubscribeBody = z.object({ endpoint: Endpoint });

async function sessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('push_subscribe', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const parsed = SubscribeBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  const { error } = await adminClient().from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      env: deployEnv(),
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 512) || null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    console.error('push subscribe failed', error.code ?? error.message);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('push_subscribe', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const parsed = UnsubscribeBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  // Scoped to the caller: you can only forget your own device.
  const { error } = await adminClient()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', user.id);
  if (error) {
    console.error('push unsubscribe failed', error.code ?? error.message);
    return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
