// POST /api/parse — the brain of the "On it!" chat loop.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extract, type ExtractResult } from '@/lib/ai';
import { sanitizeForAI } from '@/lib/sanitize';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { calculateInvoiceTotals, money, type DepositType, type FinancialLineItem } from '@/lib/financials';

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

    // Normalize and validate line items
    let hasInvalidLineItem = false;
    if (Array.isArray(result.line_items)) {
      const normalizedItems: { description: string; qty: number; unit_price: number }[] = [];

      for (const rawItem of result.line_items) {
        const itemObj = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
        const description = String(itemObj.description ?? '').trim();
        const qty = Number(itemObj.qty ?? 1);
        const unit_price = Number(itemObj.unit_price ?? itemObj.rate ?? itemObj.price ?? itemObj.amount);

        if (!Number.isFinite(qty) || !Number.isFinite(unit_price)) {
          hasInvalidLineItem = true;
          break;
        }

        normalizedItems.push({ description, qty, unit_price });
      }

      if (hasInvalidLineItem) {
        console.error('Parse line items normalization failed. Raw model line_items:', JSON.stringify(result.line_items));
        result.ready = false;
        result.line_items = [];
        result.reply = "I couldn't quite read the amounts on that job. Could you try rephrasing the prices?";
      } else {
        result.line_items = normalizedItems;
      }
    }

    // tax_rate is a percent (8 = 8%). Drop a non-finite or out-of-range value
    // rather than trust it — no fraction→percent guessing here (a real 0.5%
    // lives in (0,1) and must not be multiplied). The prompt is what keeps the
    // model emitting percents; this only bounds the result.
    if (result.tax_rate != null) {
      const rate = Number(result.tax_rate);
      result.tax_rate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
    }

    // ── Server-owned money narration ──────────────────────────────
    // The model is instructed never to state amounts; enforce it in code so the
    // spoken/rendered reply can never contradict the real bill. When the result
    // has line items we ALWAYS strip any sentence containing a "$" amount. We
    // only PREPEND our own deterministic, draft-neutral money sentence when this
    // turn actually moved the figure — otherwise a plain question turn ("What's
    // the address?") would get a redundant total read back every time.
    // Deposit lives only on the draft (deposit_type/value); the result never
    // carries it, so it's read from the draft for both totals below.
    if (Array.isArray(result.line_items) && result.line_items.length > 0) {
      const depositType = ((draft as Record<string, unknown> | null)?.deposit_type as DepositType) ?? 'none';
      const depositValue = Number((draft as Record<string, unknown> | null)?.deposit_value ?? 0);

      const totals = calculateInvoiceTotals(
        result.line_items,
        result.tax_rate ?? 0,
        depositType,
        depositValue
      );

      // Totals of the draft as it arrived, to detect whether the numbers moved.
      const draftItems = Array.isArray((draft as Record<string, unknown> | null)?.line_items)
        ? ((draft as Record<string, unknown>).line_items as unknown as FinancialLineItem[])
        : [];
      const prevTotals = calculateInvoiceTotals(
        draftItems,
        Number((draft as Record<string, unknown> | null)?.tax_rate ?? 0),
        depositType,
        depositValue
      );
      const changed =
        totals.total !== prevTotals.total ||
        totals.depositAmount !== prevTotals.depositAmount;

      // Draft-neutral: no "Here's your", no client name (see confirmSummary,
      // which keeps its own wording — it runs after the document exists).
      const moneySentence =
        totals.depositAmount > 0
          ? `Total: ${money(totals.total)}, ${money(totals.depositAmount)} deposit due now.`
          : `Total: ${money(totals.total)}.`;

      // Split on a terminator followed by whitespace (so the decimal point in
      // "$1,500.00" never splits a number), drop any sentence with a "$" amount.
      const stripped = (result.reply ?? '')
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !/\$\s?\d/.test(s))
        .join(' ')
        .trim();

      if (changed) {
        // Money sentence FIRST so a trailing question in the prose stays last.
        result.reply = stripped ? `${moneySentence} ${stripped}` : moneySentence;
      } else {
        // No change: keep the prose. Fall back to the money sentence only if
        // stripping emptied the reply, so we never emit an empty bubble.
        result.reply = stripped || moneySentence;
      }
    }

    // Duplicate detection: same client + same total in the last 48h
    let duplicateWarning: string | null = null;
    if (user && result.ready && result.intent !== 'expense') {
      const total = result.line_items.reduce((s, li) => s + li.qty * li.unit_price, 0);
      const { data: dupes } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, client_name')
        .eq('user_id', user.id)
        .is('deleted_at', null)
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
