// TEMPORARY — preview-only paywall UI review. REVERT BEFORE MERGE.
//
// GET /api/paywall-preview → 200 { enabled: true } on preview / local dev,
// 404 in production. The chat's ?paywall=invoice|expense trigger opens the
// real PaywallModal only when this answers 200, so the trigger can never
// activate in production even if this commit slips through: the gate is the
// server's VERCEL_ENV (not the client-visible paywall flag), and it writes
// nothing.
import { NextResponse } from 'next/server';
import { deployEnv } from '@/lib/deploy-env';

export async function GET() {
  if (deployEnv() === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ enabled: true });
}
