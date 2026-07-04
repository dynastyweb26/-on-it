// POST /api/parse — the brain of the "On it! 🎉" chat loop.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extract } from '@/lib/ai';
import { sanitizeForAI } from '@/lib/sanitize';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Deferred auth: unauthenticated users get 5 free parses per session
  // via a signed cookie counter — enough to feel the magic, then sign up.
  let userId = user?.id;
  if (!userId) {
    const guestCount = Number(req.cookies.get('onit_guest')?.value ?? 0);
    if (guestCount >= 5) {
      return NextResponse.json(
        { authRequired: true, reply: "Let's save your work — create your free account to keep going." },
        { status: 401 }
      );
    }
    userId = 'guest';
  }

  if (user && !(await checkRateLimit(user.id, 'parse', 20))) {
    return NextResponse.json(
      { reply: 'Whoa, slow down a second — try again in a minute.' },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.history?.length) {
    return NextResponse.json({ error: 'history required' }, { status: 400 });
  }

  const history = (body.history as { role: string; content: string }[])
    .slice(-12) // bound context
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content:
        m.role === 'user'
          ? `<user_input>${sanitizeForAI(m.content)}</user_input>`
          : m.content.slice(0, 1000),
    }));

  try {
    const result = await extract(history, body.draft ?? null, new Date().toISOString().slice(0, 10));

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
