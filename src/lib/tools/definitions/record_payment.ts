// ═══ Tool · record_payment (write, money in) ═══
//
// Money that arrived for an invoice. Audited against the two places the app
// already records a payment:
//
//   * balance — InvoiceDetailScreen passes totals.balanceRemaining to the sheet
//     (line ~1644), and financials.ts defines that as total − paid, floored at 0.
//     The stored invoices.total is the same total the screen derives, so the
//     server reads total/amount_paid instead of recomputing line items.
//   * the write — InvoiceDetailScreen.recordPayment inserts invoice_payments
//     (invoice_id, user_id, amount, method, paid_at, idempotency_key) through
//     recordPaymentOnce; the invoice_payments trigger syncs amount_paid. This tool
//     writes those same columns and never touches amount_paid.
//
// A client with more than one open invoice is ALWAYS asked which one: picking by
// amount would be the tool guessing at money. Over the balance is refused, never
// clamped. The model never sees or writes a figure: the card's amount is composed
// here with moneyText().
import { z } from 'zod';
import { defineWriteTool, type ToolContext } from '../contract';
import { ConfirmBatchProps } from '@/lib/templates/props';
import { docLabelOf, formatDay, manySentence, docByNumber } from '../write-targets';
import { moneyText, normName, resolveClient } from '../read';
import { roundCurrency } from '@/lib/financials';
import { paymentExceedsBalance, type PaymentMethod } from '@/lib/record-payment';
import { INCOME_AMOUNT_MAX, isIsoDay } from '@/lib/income-form';
import { MoneySchema, moneyIn } from '../money';
import {
  actionKey,
  isFutureDay,
  METHOD_VALUES,
  methodText,
  modelMethod,
  ownerDay,
  storedPaidAt,
} from '../payment-input';

export const RECORD_PAYMENT = 'record_payment';

export const RecordPaymentInput = z
  .object({
    /** Who paid: the name as heard. resolveClient decides who that is. */
    client: z.string().min(1).max(120).optional(),
    /** Or the invoice's number. An estimate number is refused. */
    invoice_number: z.number().int().min(1).max(1_000_000).optional(),
    /** A number, never a formatted figure. */
    amount: z.number().finite().max(INCOME_AMOUNT_MAX).optional(),
    /** "paid in full": the whole balance, computed here. */
    full: z.boolean().optional(),
    method: z.enum(METHOD_VALUES).optional(),
    /** yyyy-mm-dd; the owner's local day. */
    paid_on: z.string().max(10).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.client?.trim()) || v.invoice_number !== undefined, {
    message: 'say which invoice: its number, or its client',
  });

export const RecordPaymentOutput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  clientName: z.string().min(1),
  method: z.string().min(1),
  paidOn: z.string().min(1),
  /** Server-composed money: the number and the finished string. */
  money: MoneySchema,
});

type Resolved = {
  invoiceId: string;
  invoiceNumber: number;
  label: string;
  clientName: string;
  amount: number;
  method: PaymentMethod;
  /** The owner's local calendar day the money arrived. */
  paidOn: string;
  /** That day's local midnight in the owner's timezone. */
  paidAt: string;
};

/** The invoice columns a payment needs: total and the ledger's amount_paid. */
type InvoiceLite = {
  id: string;
  kind: string;
  invoice_number: number;
  client_name: string;
  status: string;
  total: unknown;
  amount_paid: unknown;
  deleted_at: string | null;
};

const kindOf = (raw: unknown): string => String(raw ?? 'invoice');

function asInvoiceLite(raw: Record<string, unknown>): InvoiceLite {
  return {
    id: String(raw.id),
    kind: kindOf(raw.kind),
    invoice_number: Number(raw.invoice_number),
    client_name: String(raw.client_name ?? ''),
    status: String(raw.status ?? 'draft'),
    total: raw.total,
    amount_paid: raw.amount_paid,
    deleted_at: (raw.deleted_at as string | null) ?? null,
  };
}

const amountOf = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/**
 * What the invoice still owes, the way InvoiceDetailScreen reads it: total minus
 * the ledger-synced amount_paid, never below zero (financials.balanceRemaining).
 */
export function invoiceBalance(row: Pick<InvoiceLite, 'total' | 'amount_paid'>): number {
  return roundCurrency(Math.max(0, amountOf(row.total) - amountOf(row.amount_paid)));
}

const labelOf = (row: Pick<InvoiceLite, 'kind' | 'invoice_number'>): string => docLabelOf(row);

/**
 * The app's own meaning of open (clients_saved_list): a live invoice that was
 * sent or is overdue and still owes something. A draft has not been sent, and a
 * void one was cancelled — neither can take a payment.
 */
export const OPEN_STATUSES = ['sent', 'overdue'] as const;

const isOpen = (row: InvoiceLite): boolean =>
  row.kind === 'invoice'
  && (OPEN_STATUSES as readonly string[]).includes(row.status)
  && invoiceBalance(row) > 0;

/** Every live document of the caller, oldest number first. */
async function liveInvoices(ctx: { db: ToolContext['db']; userId: string }): Promise<InvoiceLite[]> {
  const { data, error } = await ctx.db.select<Record<string, unknown>>('invoices', {
    columns: '*',
    eq: { user_id: ctx.userId },
    is: { deleted_at: null },
    order: { column: 'invoice_number', ascending: true },
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asInvoiceLite).filter((row) => !row.deleted_at);
}

/** The row this key already wrote, if any. The read that makes a replay safe. */
async function paymentByKey(
  ctx: { db: ToolContext['db']; userId: string },
  key: string,
): Promise<{ id: string } | null> {
  const { data, error } = await ctx.db.select<{ id: string }>('invoice_payments', {
    columns: 'id',
    eq: { user_id: ctx.userId, idempotency_key: key },
    limit: 1,
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

const resultOf = (r: Resolved, id: string) => ({
  id,
  label: r.label,
  clientName: r.clientName,
  method: r.method,
  paidOn: r.paidOn,
  money: moneyIn(r.amount),
});

export const recordPaymentTool = defineWriteTool({
  name: RECORD_PAYMENT,
  description:
    'Propose recording money that came in for ONE invoice: a client name or an invoice number, and an amount or "paid in full". Method is one of card, bank, zelle, cashapp, paypal, venmo, other (a cash or check payment is recorded as other), and the day defaults to today. It refuses a draft, an estimate, an invoice with nothing owed, and an amount above the balance, saying why; a client with several open invoices is asked which one. It saves nothing: the app shows a card and the owner confirms. Money with no invoice is record_other_income.',
  input: RecordPaymentInput,
  output: RecordPaymentOutput,
  type: 'write',
  risk: 'high',
  defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
  prepare: async (ctx, args) => {
    const all = await liveInvoices(ctx);
    let row: InvoiceLite | null = null;

    if (args.invoice_number !== undefined) {
      // One number can name an invoice and an estimate (they number apart), so
      // the lookup settles which; only an invoice can take a payment.
      const found = await docByNumber(ctx, args.invoice_number);
      if (!found.ok) return { ok: false, problem: found.problem };
      if (found.doc.kind !== 'invoice') {
        return {
          ok: false,
          problem: `${docLabelOf(found.doc)} is an estimate. A payment belongs to an invoice; money with no invoice is other income.`,
        };
      }
      row = all.find((candidate) => candidate.id === found.doc.id) ?? null;
      if (!row) return { ok: false, problem: `${docLabelOf(found.doc)} is gone now.` };
      if (row.status === 'draft') {
        return { ok: false, problem: `${labelOf(row)} is still a draft, so there is nothing to collect on it yet.` };
      }
      if (row.status === 'void') {
        return { ok: false, problem: `${labelOf(row)} was voided, so it cannot take a payment.` };
      }
      // Sent or overdue with a balance is open; anything else (paid, or a status
      // the app does not collect on) has nothing to take.
      if (!(OPEN_STATUSES as readonly string[]).includes(row.status) || !(invoiceBalance(row) > 0)) {
        return { ok: false, problem: `${labelOf(row)} is already paid.` };
      }
    } else {
      const said = args.client?.trim() ?? '';
      if (!said) return { ok: false, problem: 'Which invoice is the payment for?' };

      const resolution = await resolveClient(ctx, said);
      if (resolution.kind === 'none') return { ok: false, problem: `No client named ${said}.` };
      if (resolution.kind === 'many') {
        return { ok: false, problem: manySentence(`More than one client matches "${said}"`, resolution.names) };
      }

      const open = all.filter((candidate) =>
        isOpen(candidate) && normName(candidate.client_name) === normName(resolution.name));
      if (open.length === 0) return { ok: false, problem: `${resolution.name} has no open invoices.` };
      if (open.length > 1) {
        // The founder's decision: never pick by amount, even when only one
        // balance matches the figure exactly.
        return {
          ok: false,
          problem: manySentence(
            `I found ${open.length} open invoices for ${resolution.name}`,
            open.map((candidate) => labelOf(candidate)),
          ),
        };
      }
      row = open[0];
    }

    const label = labelOf(row);
    const balance = invoiceBalance(row);

    const amount = args.full === true ? balance : args.amount !== undefined ? roundCurrency(args.amount) : 0;
    if (args.full !== true && args.amount === undefined) {
      return { ok: false, problem: `How much did ${row.client_name} pay on ${label}?` };
    }
    if (!(amount > 0)) return { ok: false, problem: 'A payment needs an amount above zero.' };
    if (paymentExceedsBalance(amount, balance)) {
      return { ok: false, problem: `That is more than ${label} still owes (${moneyText(balance)}).` };
    }

    const method = modelMethod(args.method);

    const { timezone, today } = await ownerDay(ctx);
    const paidOn = args.paid_on?.trim() || today;
    if (!isIsoDay(paidOn)) {
      return { ok: false, problem: `"${paidOn}" is not a day I can read. Give the day as YYYY-MM-DD.` };
    }
    if (isFutureDay(paidOn, today)) {
      return { ok: false, problem: 'That day has not happened yet. A payment is money that already arrived.' };
    }

    return {
      ok: true,
      resolved: {
        invoiceId: row.id,
        invoiceNumber: row.invoice_number,
        label,
        clientName: row.client_name,
        amount,
        method,
        paidOn,
        paidAt: storedPaidAt(paidOn, timezone),
      } satisfies Resolved,
      row: {
        icon: 'payments',
        summary: `Record payment on ${label}`,
        detail: `${row.client_name} · ${methodText(method)} · ${formatDay(paidOn)}`,
        amount: moneyText(amount),
        tone: 'in',
      },
    };
  },
  execute: async (ctx, resolved, actionId) => {
    const r = resolved as Resolved;
    const key = actionKey(actionId);

    // The same confirm twice, or a replay whose response was lost: the key
    // already owns this money. Refuse before looking, so nothing doubles.
    const already = await paymentByKey(ctx, key);
    if (already) {
      return { ok: false, problem: `That payment on ${r.label} was already recorded.` };
    }

    // Re-read and re-validate what prepare saw: deleted, drafted, paid, moved.
    const { data, error } = await ctx.db.select<Record<string, unknown>>('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId, id: r.invoiceId },
      limit: 1,
    });
    if (error) throw new Error(error.message);
    const raw = data?.[0];
    if (!raw) return { ok: false, problem: 'That invoice is gone now.' };

    const fresh = asInvoiceLite(raw);
    if (fresh.deleted_at) return { ok: false, problem: 'That invoice was deleted since I looked.' };
    if (fresh.kind !== 'invoice') return { ok: false, problem: `${r.label} changed since I looked. Ask me again.` };
    if (fresh.status === 'draft') return { ok: false, problem: `${r.label} is a draft again. Ask me again.` };
    if (fresh.status === 'void') {
      return { ok: false, problem: `${r.label} was voided, so it cannot take a payment.` };
    }
    if (!(OPEN_STATUSES as readonly string[]).includes(fresh.status)) {
      return { ok: false, problem: `${r.label} is already paid.` };
    }

    const balance = invoiceBalance(fresh);
    if (paymentExceedsBalance(r.amount, balance)) {
      return { ok: false, problem: `${r.label} changed since I looked. Ask me again.` };
    }

    // The sheet's own columns, and no others. amount_paid is the trigger's job.
    const { error: insertError } = await ctx.db.insert('invoice_payments', {
      invoice_id: r.invoiceId,
      user_id: ctx.userId,
      amount: r.amount,
      method: r.method,
      paid_at: r.paidAt,
      idempotency_key: key,
    });
    if (!insertError) {
      return { ok: true, result: resultOf({ ...r, clientName: fresh.client_name }, `payment-${actionId}`) };
    }

    // The insert may have landed with only its response lost: the key decides.
    const landed = await paymentByKey(ctx, key);
    if (landed) return { ok: true, result: resultOf({ ...r, clientName: fresh.client_name }, landed.id) };
    throw new Error(insertError.message);
  },
  fallback: (result) => `Recorded the payment on ${result.label}.`,
  fixture: {
    args: { client: 'Maria Santos', amount: 60, method: 'zelle' },
    result: {
      id: 'payment-1',
      label: 'INV-0007',
      clientName: 'Maria Santos',
      method: 'zelle',
      paidOn: '2026-11-15',
      money: moneyIn(60),
    },
  },
  preview: {
    resolved: {
      invoiceId: 'owner-invoice',
      invoiceNumber: 7,
      label: 'INV-0007',
      clientName: 'Maria Santos',
      amount: 60,
      method: 'zelle',
      paidOn: '2026-11-15',
      paidAt: '2026-11-15T06:00:00.000Z',
    },
    row: {
      icon: 'payments',
      summary: 'Record payment on INV-0007',
      detail: 'Maria Santos · Zelle · Nov 15',
      amount: '$60.00',
      tone: 'in',
    },
  },
});
