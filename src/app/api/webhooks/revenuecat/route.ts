// POST /api/webhooks/revenuecat — store subscriptions → profiles.
//
// Server to server, so the service role is used exactly as the Stripe webhook
// uses it (no session exists). The decision logic lives in
// src/lib/revenuecat/process.ts with its I/O injected; this file only wires the
// real bindings and answers:
//   • both env values missing → 503, before anything else runs (an unconfigured
//     deployment is inert);
//   • Authorization compared in constant time, plus the optional HMAC
//     signature on the raw body → 401;
//   • the wrong store environment (production vs sandbox) → 200, skipped;
//   • unknown event type, replay, unknown/anonymous user → 200;
//   • RevenueCat API or database failure → 500 so RevenueCat retries.
//
// Never logged: the Authorization value, the secret key, or a payload.
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { writeBillingFields } from '@/lib/billing-write';
import { authorizeHeader, verifySignature } from '@/lib/revenuecat/auth';
import { environmentVerdict } from '@/lib/revenuecat/environment';
import { parseEvent, processRevenueCatEvent, type RevenueCatDeps, type RevenueCatEvent } from '@/lib/revenuecat/process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

const REVENUECAT_API = 'https://api.revenuecat.com/v1';

function deps(secretKey: string): RevenueCatDeps {
  const admin = adminClient();
  return {
    async claimEvent(event: RevenueCatEvent) {
      const { error } = await admin.from('revenuecat_events').upsert({
        event_id: event.id,
        type: event.type,
        app_user_id: event.appUserId,
        environment: event.environment,
      }, { onConflict: 'event_id', ignoreDuplicates: true });
      if (error) throw error;
      const { data, error: readError } = await admin
        .from('revenuecat_events').select('processed_at').eq('event_id', event.id).maybeSingle();
      if (readError) throw readError;
      return data?.processed_at ? 'processed' : 'claimed';
    },
    async markProcessed(eventId: string) {
      const { error } = await admin
        .from('revenuecat_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      if (error) throw error;
    },
    async findProfile(userId: string) {
      const { data, error } = await admin
        .from('profiles')
        .select('id, access_tier, billing_source, plan, plan_change_to, plan_change_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data as never) ?? null;
    },
    async fetchSubscriber(userId: string) {
      // The key never leaves this call: no log line carries it or the body.
      const res = await fetch(`${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`revenuecat subscriber ${res.status}`);
      const body = (await res.json()) as { subscriber?: unknown };
      return body.subscriber ?? null;
    },
    async writeProfile({ userId, source, fields }) {
      // Founder-guarded and source-guarded inside the UPDATE itself.
      return writeBillingFields(admin, { writer: source, match: { id: userId }, fields, guardFounder: true });
    },
    log(message, detail) {
      console.warn('[revenuecat]', message, JSON.stringify(detail ?? {}));
    },
    now: () => new Date(),
  };
}

export async function POST(req: NextRequest) {
  const authValue = (process.env.REVENUECAT_WEBHOOK_AUTH ?? '').trim();
  const secretKey = (process.env.REVENUECAT_SECRET_KEY ?? '').trim();
  if (!authValue || !secretKey) {
    // Unconfigured: inert, silent, and nothing was read or written.
    return json({ error: 'not configured' }, 503);
  }

  const raw = await req.text();
  if (!authorizeHeader(req.headers.get('authorization'), authValue)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const signingSecret = (process.env.REVENUECAT_WEBHOOK_SECRET ?? '').trim();
  if (signingSecret) {
    const verdict = verifySignature(
      raw,
      req.headers.get('x-revenuecat-webhook-signature'),
      signingSecret,
      new Date(),
    );
    if (verdict !== 'ok') {
      console.warn('[revenuecat] signature refused', verdict);
      return json({ error: verdict === 'stale' ? 'stale signature' : 'invalid signature' }, 401);
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const event = parseEvent(payload);
  if (!event) return json({ error: 'invalid event' }, 400);

  // Production takes only production events; preview (and local) only sandbox.
  if (environmentVerdict(process.env.VERCEL_ENV, event.environment) === 'skip') {
    console.warn('[revenuecat] environment skipped', JSON.stringify({
      eventId: event.id,
      type: event.type,
      environment: event.environment,
      vercelEnv: process.env.VERCEL_ENV ?? null,
    }));
    return json({ received: true, skipped: 'environment' }, 200);
  }

  const result = await processRevenueCatEvent(event, deps(secretKey));
  return json(result.body, result.status);
}
