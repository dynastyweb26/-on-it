// ═══ Tool · record_other_income (write, money in with no invoice) ═══
//
// The money no invoice explains: a job paid outside On It, a family loan repaid,
// a vendor refund the owner counts as income. It is stored exactly the way
// POST /api/income/unattached stores it — same parser, same row builder
// (lib/unattached-payment): classification 'other_income', the neutral default
// title, the table's own title and amount limits — so a row written here is
// indistinguishable from one written by the form.
//
// Idempotency is the unattached path's too: one key per action, the partial
// unique index on (user_id, idempotency_key) makes a replay one row, and an
// insert error is read back by that key before it is called a failure.
//
// This tool is only for money with no invoice. A client name means the money
// belongs to an invoice, so record_payment owns that request.
import { z } from 'zod';
import { defineWriteTool, type ToolContext } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { INCOME_AMOUNT_MAX, isIsoDay } from '@/lib/income-form';
import {
  UNATTACHED_PAYMENT_TITLE,
  parseUnattachedPayment,
  unattachedInsertRow,
} from '@/lib/unattached-payment';
import { formatDay, manySentence } from '../write-targets';
import { moneyText, resolveClient } from '../read';
import { MoneySchema, moneyIn } from '../money';
import {
  actionKey,
  isFutureDay,
  METHOD_VALUES,
  methodText,
  modelMethod,
  ownerDay,
} from '../payment-input';

export const RECORD_OTHER_INCOME = 'record_other_income';

export const RecordOtherIncomeInput = z
  .object({
    /** A number, never a formatted figure. */
    amount: z.number().finite().max(INCOME_AMOUNT_MAX),
    /** Who paid, as heard. Resolved against the client list when it can be. */
    payer: z.string().min(1).max(120).optional(),
    /** What it was. Omitted takes the payer's name, then "Other income". */
    title: z.string().max(200).optional(),
    method: z.enum(METHOD_VALUES).optional(),
    /** yyyy-mm-dd; the owner's local day. */
    received_on: z.string().max(10).optional(),
  })
  .strict();

export const RecordOtherIncomeOutput = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  receivedOn: z.string().min(1),
  money: MoneySchema,
});

type Resolved = {
  amount: number;
  method: ReturnType<typeof modelMethod>;
  /** The owner's local calendar day the money arrived. */
  receivedOn: string;
  /** The payer as saved: the client's own name, the words said, or null. */
  clientName: string | null;
  title: string;
};

/** The row this key already wrote, if any. The read that makes a replay safe. */
async function incomeByKey(
  ctx: { db: ToolContext['db']; userId: string },
  key: string,
): Promise<{ id: string } | null> {
  const { data, error } = await ctx.db.select<{ id: string }>('other_income', {
    columns: 'id',
    eq: { user_id: ctx.userId, idempotency_key: key },
    limit: 1,
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

const resultOf = (r: Resolved, id: string) => ({
  id,
  title: r.title,
  receivedOn: r.receivedOn,
  money: moneyIn(r.amount),
});

/** One sentence per refusal the shared parser can answer with. */
const PROBLEM: Record<string, string> = {
  amount_invalid: 'Money in needs an amount above zero.',
  method_invalid: 'I do not know that payment method.',
  date_invalid: 'That is not a day I can read. Give the day as YYYY-MM-DD.',
  title_too_long: 'That name is too long.',
  client_too_long: 'Keep the payer name to 120 characters or fewer.',
};

export const recordOtherIncomeTool = defineWriteTool({
  name: RECORD_OTHER_INCOME,
  description:
    'Propose recording money that came in with NO invoice behind it, such as a job paid outside the app, a repaid loan or other income: an amount, an optional payer name (who paid), an optional name for what it was, an optional method (card, bank, zelle, cashapp, paypal, venmo, other) and an optional day. It saves nothing: the app shows a card and the owner confirms. Use it only when the user says there is no invoice or it is not for a job invoice; money for a client invoiced in the app is record_payment.',
  input: RecordOtherIncomeInput,
  output: RecordOtherIncomeOutput,
  type: 'write',
  risk: 'medium',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    const { today } = await ownerDay(ctx);
    const receivedOn = args.received_on?.trim() || today;
    if (!isIsoDay(receivedOn)) {
      return { ok: false, problem: PROBLEM.date_invalid };
    }
    if (isFutureDay(receivedOn, today)) {
      return { ok: false, problem: 'That day has not happened yet. Income is money that already arrived.' };
    }

    // Who paid: one saved client takes their own spelling, several is the
    // shared ask-which-one sentence, and a name nobody has is kept as said.
    let clientName: string | null = null;
    const said = args.payer?.trim() ?? '';
    if (said) {
      const resolution = await resolveClient(ctx, said);
      if (resolution.kind === 'many') {
        return { ok: false, problem: manySentence(`More than one client matches "${said}"`, resolution.names) };
      }
      clientName = resolution.kind === 'one' ? resolution.name : said;
    }

    const method = modelMethod(args.method);
    // The route's own parser and limits, so this row is the form's row.
    const parsed = parseUnattachedPayment({
      amount: args.amount,
      method,
      received_on: receivedOn,
      client_name: clientName,
      title: args.title,
    });
    if (!parsed.ok) return { ok: false, problem: PROBLEM[parsed.code] ?? 'That income cannot be recorded.' };

    const value = parsed.value;
    return {
      ok: true,
      resolved: {
        amount: value.amount,
        method: value.method,
        receivedOn: value.received_on,
        clientName: value.client_name,
        title: value.title,
      } satisfies Resolved,
      row: {
        icon: 'savings',
        // The payer is the card's subject when there is one; otherwise the name
        // the money was given, and the neutral line when it has none.
        summary: value.client_name
          ? `Record income from ${value.client_name}`
          : value.title === UNATTACHED_PAYMENT_TITLE
            ? 'Record other income'
            : `Record other income: ${value.title}`,
        detail: `${methodText(value.method)} · ${formatDay(value.received_on)}`,
        amount: moneyText(value.amount),
        tone: 'in',
      },
    };
  },
  execute: async (ctx, resolved, actionId) => {
    const r = resolved as Resolved;
    const key = actionKey(actionId);

    // Same confirm twice, or a lost response replayed: the key owns this money.
    const already = await incomeByKey(ctx, key);
    if (already) return { ok: false, problem: 'That income was already recorded.' };

    // The unattached route's row builder: same columns, same classification.
    const row = unattachedInsertRow(
      ctx.userId,
      {
        amount: r.amount,
        method: r.method,
        received_on: r.receivedOn,
        client_name: r.clientName,
        title: r.title,
      },
      key,
    );
    const { error } = await ctx.db.insert('other_income', row);
    if (!error) return { ok: true, result: resultOf(r, `income-${actionId}`) };

    // The insert may have landed with only its response lost: the key decides.
    const landed = await incomeByKey(ctx, key);
    if (landed) return { ok: true, result: resultOf(r, landed.id) };
    throw new Error(error.message);
  },
  fallback: (result) =>
    result.title === UNATTACHED_PAYMENT_TITLE
      ? 'Recorded the income.'
      : `Recorded ${result.title} as income.`,
  fixture: {
    args: { amount: 150, method: 'cash', title: 'Side job' },
    result: { id: 'income-1', title: 'Side job', receivedOn: '2026-11-15', money: moneyIn(150) },
  },
  preview: {
    resolved: { amount: 150, method: 'other', receivedOn: '2026-11-15', clientName: null, title: 'Side job' },
    row: {
      icon: 'savings',
      summary: 'Record other income: Side job',
      detail: 'Other · Nov 15',
      amount: '$150.00',
      tone: 'in',
    },
  },
});
