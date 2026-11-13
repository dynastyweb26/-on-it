// POST /api/ask/request-feature — ask the founder to build the missing answer.
//
// The message id is the only client input. The question comes from that turn in
// chat_messages under the caller's session; no request text is accepted here.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import { aiEnvRefusal, logEnvRefusal } from '@/lib/tools/env-guard';
import { handleFeatureRequest } from '@/lib/ask-feature-request';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function POST(req: NextRequest) {
  // Same two gates as /api/ask and /api/ask/feedback.
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const refusal = aiEnvRefusal({
    flagOn: AI_TOOLS,
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (refusal) {
    logEnvRefusal(refusal, 'ask/request-feature');
    return NextResponse.json(
      { error: refusal, reply: 'The assistant is not available on this preview.' },
      { status: 503, ...NO_STORE },
    );
  }

  const supabase = await createClient();
  return handleFeatureRequest(req, supabase);
}
