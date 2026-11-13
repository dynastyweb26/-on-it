// POST /api/ask/feedback — save, change or clear a thumbs vote.
//
// The vote belongs to one chat_messages row. The route checks that row under
// the CALLER'S session before writing anything, so another owner's message id
// is refused here; the table's RLS policy repeats the check as the real boundary.
// No service role, no migration.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import { aiEnvRefusal, logEnvRefusal } from '@/lib/tools/env-guard';
import { handleFeedback } from '@/lib/ask-feedback';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function POST(req: NextRequest) {
  // Same two gates as /api/ask: the build-time flag and a preview deployment.
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Same production-database refusal as /api/ask: a preview pointed at the
  // production project must not write feedback.
  const refusal = aiEnvRefusal({
    flagOn: AI_TOOLS,
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (refusal) {
    logEnvRefusal(refusal, 'ask/feedback');
    return NextResponse.json(
      { error: refusal, reply: 'The assistant is not available on this preview.' },
      { status: 503, ...NO_STORE },
    );
  }

  const supabase = await createClient();
  return handleFeedback(req, supabase);
}
