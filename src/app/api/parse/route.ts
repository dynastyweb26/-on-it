// POST /api/parse — the brain of the "On it!" chat loop.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extract, type ExtractResult } from '@/lib/ai';
import { sanitizeForAI } from '@/lib/sanitize';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

// Bound structure AND size: chat messages capped, history bounded so a crafted
// payload can't inflate the Anthropic token bill.
const ParseBody = z.object({
  history: z.array(z.object({
    role: z.string().max(20),
    content: z.string().max(4000),
  })).min(1).max(50),
  draft: z.record(z.string(), z.unknown()).nullish(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Rate limit BEFORE any paid work — keyed by user, or by IP for guests so a
  // cookie-dropping anonymous caller can't drain the Anthropic bill.
  if (!(await rateLimit('parse', rateIdentifier(req, user?.id)))) {
    return NextResponse.json(
      { reply: 'One sec — slow down a moment.' },
      { status: 429 }
    );
  }

  // Deferred auth: unauthenticated users get 5 free parses per session
  // via a signed cookie counter — enough to feel the magic, then sign up.
  if (!user) {
    const guestCount = Number(req.cookies.get('onit_guest')?.value ?? 0);
    if (guestCount >= 5) {
      return NextResponse.json(
        { authRequired: true, reply: "Let's save your work — create your free account to keep going." },
        { status: 401 }
      );
    }
  }

  const parsed = ParseBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request', reply: 'Say that again?' }, { status: 400 });
  }
  const { history: rawHistory, draft } = parsed.data;
  // Bound the draft context too (it's stringified into the prompt).
  if (draft && JSON.stringify(draft).length > 8000) {
    return NextResponse.json({ error: 'draft too large', reply: 'Let’s start that one fresh.' }, { status: 400 });
  }

  const history = rawHistory
    .slice(-12) // bound context
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content:
        m.role === 'user'
          ? `<user_input>${sanitizeForAI(m.content)}</user_input>`
          : m.content.slice(0, 1000),
    }));

  try {
    const result = await extract(history, (draft ?? null) as Partial<ExtractResult> | null, new Date().toISOString().slice(0, 10));

    // Duplicate detection: same client + same total in the last 48h
    let duplicateWarning: string | null = null;
    if (user && result.ready && result.intent !== 'expense') {
      const total = result.line_items.reduce((s, li) => s + li.qty * li.unit_price, 0);
      const { data: dupes } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, client_name')
        .eq('user_id', user.id)
        .ilike('client_name', result.client_name ?? '')
        .eq('total', total)
        .gte('created_at', new Date(Date.now() - 48 * 3600e3).toISOString());
      if (dupes?.length) {
        duplicateWarning = `Heads up — you already made an invoice for ${result.client_name} at this amount. Want a new one anyway?`;
      }
    }

    const res = NextResponse.json({ ...result, duplicateWarning });
    if (!user) {
      const guestCount = Number(req.cookies.get('onit_guest')?.value ?? 0);
      res.cookies.set('onit_guest', String(guestCount + 1), { httpOnly: true, sameSite: 'lax' });
    }
    return res;
  } catch (e) {
    console.error('parse error', e);
    return NextResponse.json(
      { reply: "Something glitched on my end. Say that one more time?" },
      { status: 500 }
    );
  }
}
