// POST /api/parse — the brain of the "On it!" chat loop.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extract, calculateLineAmount, classifyTurnIntent, performSubjectHoisting, type ExtractResult, type LineItem } from '@/lib/ai';
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

  const lastUserMsg = [...rawHistory].reverse().find((m) => m.role === 'user')?.content || '';
  const turnIntent = classifyTurnIntent(lastUserMsg, Boolean(draft));

  if (turnIntent === 'undo') {
    return NextResponse.json({
      intent: 'question',
      ready: false,
      reply: 'Reverted to previous document version.',
      action: 'undo',
    });
  }

  // 3.4 Pass current document state and last turn, not full instruction transcript
  const history = turnIntent === 'amend' || turnIntent === 'query'
    ? [{ role: 'user' as const, content: `<user_input>${sanitizeForAI(lastUserMsg)}</user_input>` }]
    : rawHistory.slice(-12).map((m) => ({
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
      const normalizedItems: LineItem[] = [];

      for (const rawItem of result.line_items) {
        const itemObj = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
        const description = String(itemObj.description ?? '').trim();
        const qty = Number(itemObj.qty ?? 1);
        const unit_price = Number(itemObj.unit_price ?? itemObj.rate ?? itemObj.price ?? itemObj.amount);

        if (!Number.isFinite(qty) || !Number.isFinite(unit_price)) {
          hasInvalidLineItem = true;
          break;
        }

        normalizedItems.push({
          ...(itemObj as unknown as LineItem),
          description,
          qty,
          unit_price,
          rate: unit_price,
        });
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

    // 3.5 Verbatim descriptions: preserve description/spec of unreferenced existing lines on amend
    if (turnIntent === 'amend' && draft && Array.isArray(draft.line_items) && draft.line_items.length > 0 && Array.isArray(result.line_items)) {
      const prevItems = draft.line_items as LineItem[];
      result.line_items = result.line_items.map((newItem, idx) => {
        const oldItem = prevItems[idx];
        if (!oldItem) return newItem;

        const descriptionReferenced = lastUserMsg.toLowerCase().includes(oldItem.description.toLowerCase());
        const specReferenced = oldItem.spec && lastUserMsg.toLowerCase().includes(oldItem.spec.toLowerCase());

        return {
          ...newItem,
          description: descriptionReferenced ? newItem.description : oldItem.description,
          spec: specReferenced ? newItem.spec : oldItem.spec,
        };
      });
    }

    // 3.1 Validation and post-processing math
    if (result.line_items && result.line_items.length > 0 && result.intent !== 'expense') {
      let missingBasis = false;
      for (const li of result.line_items) {
        if (!li.amount_basis || (li.amount_basis !== 'unit' && li.amount_basis !== 'extended')) {
          missingBasis = true;
          break;
        }
      }

      if (missingBasis && result.ready) {
        result.ready = false;
        result.reply = "Could you clarify if the prices given are per single item or total extended amounts?";
      }

      for (const li of result.line_items) {
        const qty = Number(li.qty) || 1;
        const rawRate = Number(li.rate ?? li.unit_price) || 0;
        const unitBasis = li.unit_basis ?? 'unit';
        const unitQty = li.unit_qty != null ? Number(li.unit_qty) : 1;

        let unitPrice = rawRate;
        if (li.amount_basis === 'extended') {
          const factor = (unitBasis === 'area' || unitBasis === 'linear' || unitBasis === 'hour') ? (qty * (unitQty || 1)) : qty;
          unitPrice = factor > 0 ? rawRate / factor : rawRate;
        }

        li.rate = Math.round(unitPrice * 100) / 100;
        li.unit_price = Math.round(unitPrice * 100) / 100;
      }
    }

    // 3.2 Reconciliation check against raw total/subtotal strings
    if (result.ready && result.intent !== 'expense' && result.line_items && result.line_items.length > 0) {
      const allUserInput = rawHistory
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n');

      const matches = [...allUserInput.matchAll(/(?:GRAND\s+TOTAL|TOTAL|SUBTOTAL)[\s:]*\$?([\d,]+\.?\d*)/gi)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const statedTotalStr = lastMatch[1].replace(/,/g, '');
        const statedTotal = parseFloat(statedTotalStr);

        if (!isNaN(statedTotal)) {
          const computedTotal = result.line_items.reduce(
            (s, li) => s + calculateLineAmount(li),
            0
          );

          if (Math.abs(statedTotal - computedTotal) > 0.02) {
            result.ready = false;
            result.reply = `The stated total ($${statedTotal.toFixed(2)}) doesn't match the sum of the line items ($${computedTotal.toFixed(2)}). Which total is correct?`;
          }
        }
      }
    }

    if (result.tax_rate != null && !Number.isFinite(Number(result.tax_rate))) {
      result.tax_rate = null;
    }

    // 3.6 Subject hoisting post-processing
    if (result.ready && result.intent !== 'expense' && result.line_items) {
      const hoisted = performSubjectHoisting(result.line_items as LineItem[]);
      if (hoisted.subject) {
        result.subject = result.subject || hoisted.subject;
        result.line_items = hoisted.line_items;
      }
    }

    // 3.3 Narration template from persisted line items and total
    if (result.ready && result.intent !== 'expense' && result.line_items && result.line_items.length > 0) {
      const lineCount = result.line_items.length;
      const customer = result.client_name || 'customer';
      const computedTotal = result.line_items.reduce(
        (s, li) => s + calculateLineAmount(li),
        0
      );
      const formattedTotal = `$${computedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      result.reply = `Updated. ${lineCount} line item${lineCount === 1 ? '' : 's'} for ${customer}. Total ${formattedTotal}. Ready to send?`;
    }

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
